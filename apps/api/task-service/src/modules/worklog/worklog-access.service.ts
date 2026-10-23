import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';
import { Session } from './worklog-helpers';

/**
 * Who may act on a work log: the shift session a note belongs to, checked against
 * the caller, and a job reference kept only when it is this organization's.
 */
@Injectable()
export class WorklogAccess {
  constructor(private readonly prisma: PrismaService) {}

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
  async session(
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

  async sessionForNote(
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

  async keepOrgTaskId(taskId: unknown, organizationId: string): Promise<string | null> {
    if (typeof taskId !== 'string' || !taskId) return null;
    const t = await this.prisma.task.findFirst({ where: { id: taskId, organizationId }, select: { id: true } });
    return t ? t.id : null;
  }
}
