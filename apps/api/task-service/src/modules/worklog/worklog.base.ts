import { Inject, Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OBJECT_STORE, ObjectStore, extensionForMime } from '@hbcfield/shared/storage';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MediaSigner } from '../../common/storage/media-signer.service';
import { BODY_MAX, Session } from './worklog-helpers';

/**
 * What every work-log path shares: the shift session a note belongs to, object
 * keys, a clean body, a time, the job reference, and deleting an object.
 */
@Injectable()
export abstract class WorklogBase {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    @Inject(OBJECT_STORE) protected readonly store: ObjectStore | null,
    protected readonly media: MediaSigner,
  ) {}

  // ── Ownership ──────────────────────────────────────────────────────────────

  /**
   * Load a session (org-scoped) and assert the caller may act on it.
   *
   * `canManage` is the ORG-wide answer. A supervisor whose authority comes from
   * a space role has it false and was refused their own crew's log — the same
   * shape as the shift-issues list, which read the flat columns and counted a
   * space-granted member as nobody.
   *
   * `manageSpaceIds` carries the spaces they oversee (server-resolved, never
   * client-supplied), and a session is theirs to manage when it was clocked at
   * one of them. `undefined` means the caller was not scoped — org-wide — and
   * `[]` means granted nowhere, which must match NOTHING rather than everything.
   */
  protected async session(
    timeEntryId: string,
    organizationId: string,
    callerUserId: string,
    canManage: boolean,
    manageSpaceIds?: string[],
  ): Promise<Session> {
    const te = await this.prisma.timeEntry.findFirst({
      where: { id: timeEntryId, organizationId },
      select: { id: true, userId: true, organizationId: true, clockInAt: true, locationId: true },
    });
    if (!te) throw new NotFoundException('Attendance session not found');
    const mine = te.userId === callerUserId;
    const inMySpace = !!manageSpaceIds?.includes(te.locationId);
    if (!mine && !canManage && !inMySpace) throw new ForbiddenException('Not your session');
    return te;
  }

  protected async sessionForNote(
    noteId: string,
    organizationId: string,
    callerUserId: string,
    canManage: boolean,
    manageSpaceIds?: string[],
  ) {
    const note = await this.prisma.timeEntryNote.findFirst({
      where: { id: noteId, organizationId },
      select: { id: true, timeEntryId: true },
    });
    if (!note) throw new NotFoundException('Note not found');
    const te = await this.session(note.timeEntryId, organizationId, callerUserId, canManage, manageSpaceIds);
    return { note, te };
  }

  // ── The object key: {orgId}/attendance/{YYYY}/{MM}/{DD}/{userId}/{timeEntryId}/{uuid}.{ext}
  protected objectKey(te: Session, mime: string): string {
    return `${this.sessionPrefix(te)}${randomUUID()}.${extensionForMime(mime)}`;
  }

  /** Every attachment for this session lives under this key prefix (confirm guard). */
  protected sessionPrefix(te: Session): string {
    const d = te.clockInAt ?? new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${te.organizationId}/attendance/${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}/${te.userId}/${te.id}/`;
  }

  protected cleanBody(body: unknown): string {
    const b = typeof body === 'string' ? body.trim() : '';
    if (!b) throw new BadRequestException('Note text is required');
    return b.slice(0, BODY_MAX);
  }

  protected parseAt(at: unknown): Date {
    if (typeof at === 'string' || typeof at === 'number') {
      const d = new Date(at);
      // Reject garbage / far-future (>1 day ahead); fall back to now.
      if (!isNaN(d.getTime()) && d.getTime() < Date.now() + 24 * 60 * 60 * 1000) return d;
    }
    return new Date();
  }

  protected async keepOrgTaskId(taskId: unknown, organizationId: string): Promise<string | null> {
    if (typeof taskId !== 'string' || !taskId) return null;
    const t = await this.prisma.task.findFirst({ where: { id: taskId, organizationId }, select: { id: true } });
    return t ? t.id : null;
  }

  // ── Storage helpers ─────────────────────────────────────────────────────────

  /** Never fails the user's delete: an orphaned object costs a fraction of a cent. */
  protected async deleteObject(key: string): Promise<void> {
    if (this.store && !(await this.store.delete(key))) {
      this.logger.warn(`Failed to delete stored object ${key}`);
    }
  }
}
