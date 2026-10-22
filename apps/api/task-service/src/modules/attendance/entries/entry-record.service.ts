import { Injectable, NotFoundException } from '@nestjs/common';
import { personName, success, recordHistory } from '@hbcfield/shared';
import { assertNotSelfDecision } from '../core/self-decision';
import { scopeWhere, type AttendanceScope } from '@hbcfield/shared';
import { EntryServiceBase } from './entry-service.base';

/** One entry's change history, and deleting an entry. */
@Injectable()
export class EntryRecordService extends EntryServiceBase {
  /**
   * Full edit history for an entry — the per-edit audit rows written on each
   * editEntry (org-scoped, newest-first, served by the [resourceId, createdAt]
   * index). Drives the "Edit history" table in the UI.
   */
  async getEntryHistory(data: { entryId: string; organizationId: string; scopeSpaceIds?: AttendanceScope }) {
    /*
      Only the caller's granted spaces — an entry outside them reads as 'not
      found'. ⚠️ Asked of the ENTRY: an activity-log row has no space column, and
      spreading `scopeWhere` onto it made every scoped caller's history request
      fail in Prisma on an unknown argument.
    */
    if (data.scopeSpaceIds !== null && data.scopeSpaceIds !== undefined) {
      const inScope = await this.prisma.timeEntry.findFirst({
        where: { id: data.entryId, organizationId: data.organizationId, ...scopeWhere(data.scopeSpaceIds) },
        select: { id: true },
      });
      if (!inScope) throw new NotFoundException('Time entry not found');
    }
    const logs = await recordHistory(this.prisma, {
      resourceId: data.entryId,
      organizationId: data.organizationId,
      eventType: 'TIME_ENTRY_EDITED',
    });
    return success(
      logs.map((l) => {
        const meta = (l.metadata as { reason?: string; changes?: unknown[] } | null) ?? {};
        return {
          id: l.id,
          editedAt: l.createdAt,
          editor: l.user ? personName(l.user) : null,
          reason: meta.reason ?? null,
          changes: Array.isArray(meta.changes) ? meta.changes : [],
        };
      }),
    );
  }

  /** Admin: delete a time entry (its breaks cascade), scoped to the org. */
  async deleteEntry(data: {
    entryId: string;
    editorId: string;
    organizationId: string;
    scopeSpaceIds?: AttendanceScope;
    reason?: string;
  }) {
    const entry = await this.prisma.timeEntry.findFirst({
      // Scoped: an entry in a space the caller was not granted reads as 'not
      // found', which is both the right refusal and the right disclosure.
      where: { id: data.entryId, organizationId: data.organizationId, ...scopeWhere(data.scopeSpaceIds) },
      select: {
        id: true,
        userId: true,
        locationId: true,
        clockInAt: true,
        clockOutAt: true,
        paidMinutes: true,
        approvalStatus: true,
        flagReasons: true,
      },
    });
    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }
    /*
      ⚠️ Deleting is deciding too. A shift leader holding the reconcile grant
      could delete their own flagged or rejected entry — the same move on their
      own record that edit and approve already refuse. Somebody else does it
      (self-decision.ts).
    */
    await assertNotSelfDecision(this.prisma as never, {
      deciderId: data.editorId,
      subjectId: entry.userId,
      organizationId: data.organizationId,
      message: 'You cannot delete your own time entry. Ask a manager or an administrator.',
    });
    // Break has onDelete: Cascade, so removing the entry removes its breaks.
    await this.prisma.timeEntry.delete({ where: { id: data.entryId } });
    // The row is gone, so this is the record that it existed and who removed it.
    await this.auditEntry({
      eventType: 'TIME_ENTRY_DELETED',
      entryId: data.entryId,
      actorId: data.editorId,
      organizationId: data.organizationId,
      targetUserId: entry.userId,
      metadata: {
        reason: data.reason?.trim() || null,
        entry: {
          userId: entry.userId,
          locationId: entry.locationId,
          clockInAt: entry.clockInAt.toISOString(),
          clockOutAt: entry.clockOutAt ? entry.clockOutAt.toISOString() : null,
          paidMinutes: entry.paidMinutes ?? null,
          approvalStatus: entry.approvalStatus,
          flagReasons: entry.flagReasons ?? [],
        },
      },
    });
    this.logger.log(`Entry deleted: entry=${data.entryId}, editor=${data.editorId}`);
    this.emitChanged(data.organizationId, 'delete', data.entryId);
    return success({ id: data.entryId }, 'Time entry removed');
  }
}
