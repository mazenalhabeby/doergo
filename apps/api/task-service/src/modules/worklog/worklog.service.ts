import { Injectable } from '@nestjs/common';
import { personName, success, peopleNames } from '@hbcfield/shared';
import { createOnce } from '../../common/create-once.util';
import { BODY_MAX, BATCH_MAX } from './worklog-helpers';
import { WorklogBase } from './worklog.base';

/**
 * Session work-log: timestamped notes (optionally with S3 photos/files) added
 * during a clock-in session. All access is decided server-side from the verified
 * token — a member manages their OWN session's log; managers (canManage) may view/
 * manage any session in their org. Bytes go phone→S3 direct; the DB holds only keys.
 */
@Injectable()
export class WorklogService extends WorklogBase {
  // ── Notes ──────────────────────────────────────────────────────────────────

  async addNote(data: {
    organizationId: string;
    timeEntryId: string;
    callerUserId: string;
    canManage?: boolean;
    /** Spaces the caller oversees; undefined = org-wide, [] = none. */
    manageSpaceIds?: string[];
    body: string;
    at?: string;
    taskId?: string;
    /** Made on the phone: a note written offline and sent twice is still one note. */
    id?: string;
  }) {
    // Writable by the session owner (the member) OR a manager/responsible party (canManage).
    const te = await this.session(
      data.timeEntryId,
      data.organizationId,
      data.callerUserId,
      !!data.canManage,
      data.manageSpaceIds,
    );
    const body = this.cleanBody(data.body);
    const at = this.parseAt(data.at);
    const taskId = await this.keepOrgTaskId(data.taskId, data.organizationId);
    const { row } = await createOnce({
      id: data.id,
      find: (id) => this.prisma.timeEntryNote.findUnique({ where: { id } }),
      // The same note: same session, same author. Anything else is somebody else's id.
      isSame: (n) => n.timeEntryId === te.id && n.authorId === data.callerUserId,
      create: () =>
        this.prisma.timeEntryNote.create({
          data: {
            ...(data.id ? { id: data.id } : {}),
            timeEntryId: te.id,
            userId: te.userId, // the session's member
            authorId: data.callerUserId, // who actually wrote it (member or manager)
            organizationId: data.organizationId,
            body,
            at,
            taskId,
          },
        }),
    });
    return success(row);
  }

  /** Offline flush: many notes in one round-trip. Session validated once. */
  async addNotesBatch(data: {
    organizationId: string;
    timeEntryId: string;
    callerUserId: string;
    canManage?: boolean;
    /** Spaces the caller oversees; undefined = org-wide, [] = none. */
    manageSpaceIds?: string[];
    notes: Array<{ body: string; at?: string; taskId?: string }>;
  }) {
    const te = await this.session(
      data.timeEntryId,
      data.organizationId,
      data.callerUserId,
      !!data.canManage,
      data.manageSpaceIds,
    ); // owner or manager (canManage)
    const items = Array.isArray(data.notes) ? data.notes.slice(0, BATCH_MAX) : [];
    const rows = [];
    for (const n of items) {
      const body = (typeof n?.body === 'string' ? n.body.trim() : '').slice(0, BODY_MAX);
      if (!body) continue; // skip empties, never throw the whole flush away
      rows.push({
        timeEntryId: te.id,
        userId: te.userId,
        authorId: data.callerUserId,
        organizationId: data.organizationId,
        body,
        at: this.parseAt(n.at),
        taskId: await this.keepOrgTaskId(n.taskId, data.organizationId),
      });
    }
    if (rows.length) await this.prisma.timeEntryNote.createMany({ data: rows });
    return success({ inserted: rows.length });
  }

  async listNotes(data: {
    organizationId: string;
    timeEntryId: string;
    callerUserId: string;
    canManage?: boolean;
    manageSpaceIds?: string[];
  }) {
    const te = await this.session(
      data.timeEntryId,
      data.organizationId,
      data.callerUserId,
      !!data.canManage,
      data.manageSpaceIds,
    );
    const notes = await this.prisma.timeEntryNote.findMany({
      where: { timeEntryId: data.timeEntryId, organizationId: data.organizationId },
      orderBy: { at: 'asc' },
      include: { attachments: true },
      take: 1000,
    });

    // Resolve author display names in one query. `authorId` is null for legacy
    // rows → fall back to the session's member (userId).
    const authorIds = Array.from(new Set(notes.map((n) => n.authorId ?? n.userId)));
    const users = authorIds.length
      ? await peopleNames(this.prisma, authorIds, { organizationId: data.organizationId })
      : [];
    const nameById = new Map(users.map((u) => [u.id, personName(u) || 'Member']));

    // Short-lived signed GET URLs so a private bucket stays private.
    const withUrls = await Promise.all(
      notes.map(async (n) => {
        const authorId = n.authorId ?? n.userId;
        return {
          ...n,
          author: { id: authorId, name: nameById.get(authorId) ?? 'Member' },
          // true when a manager/admin (not the session's member) wrote it.
          byManager: authorId !== te.userId,
          attachments: await this.media.signAll(n.attachments),
        };
      }),
    );
    return success(withUrls);
  }

  async deleteNote(data: {
    organizationId: string;
    noteId: string;
    callerUserId: string;
    canManage?: boolean;
    manageSpaceIds?: string[];
  }) {
    const { note } = await this.sessionForNote(
      data.noteId,
      data.organizationId,
      data.callerUserId,
      !!data.canManage,
      data.manageSpaceIds,
    ); // owner or manager (canManage)
    const atts = await this.prisma.timeEntryNoteAttachment.findMany({
      where: { noteId: note.id },
      select: { fileKey: true },
    });
    await this.prisma.timeEntryNote.delete({ where: { id: note.id } }); // cascades attachment rows
    for (const a of atts) void this.deleteObject(a.fileKey);
    return success({ success: true });
  }
}
