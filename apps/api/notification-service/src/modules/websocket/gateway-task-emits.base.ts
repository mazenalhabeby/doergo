import { jobAudience } from '@hbcfield/shared';
import { SocketEvents } from '@hbcfield/shared';
import { GatewayCoreBase } from './gateway-core.base';
import type { TaskPayload } from './socket-payloads';

/** Who declined, as far as the log line reads it; passed to clients as it came. */
type DeclinedBy = { firstName?: string | null; lastName?: string | null } | null | undefined;

/** Task, space and document-type events — moved here unchanged from websocket.gateway.ts. */
export abstract class GatewayTaskEmitsBase extends GatewayCoreBase {
  // =========================================================================
  // TASK DELETED EVENT
  // =========================================================================

  emitTaskDeleted(taskId: string, organizationId: string, spaceId?: string) {
    this.logger.log(`[EMIT] task.deleted (taskId: ${taskId}) to taskviewers:${organizationId}`);
    this.messagesSent++;
    let target = this.server.to(`taskviewers:${organizationId}`).to(`task:${taskId}`);
    // Cross-org shared-space guests live in space:{spaceId}, not taskviewers.
    if (spaceId) target = target.to(`space:${spaceId}`);
    target.emit(SocketEvents.TASK_DELETED, { taskId, organizationId });
  }

  // Emit methods called by notification controller
  // Cross-org shared-space guests live in `space:{spaceId}` (not taskviewers of the
  // owner org), so task events must also fan out there. Owner members get it via
  // taskviewers; guests via the space room — Socket.IO dedups any client in both.
  protected taskTargets(task: TaskPayload) {
    let t = this.server.to(`taskviewers:${task.organizationId}`);
    if (task.spaceId) t = t.to(`space:${task.spaceId}`);
    return t;
  }

  emitTaskCreated(task: TaskPayload) {
    this.logger.log(`[EMIT] task.created to org:${task.organizationId}`);
    this.messagesSent++;
    this.taskTargets(task).emit(SocketEvents.TASK_CREATED, task);
  }

  emitTaskAssigned(task: TaskPayload, workerId: string) {
    this.logger.log(`[EMIT] task.assigned to org:${task.organizationId} and user:${workerId}`);
    this.messagesSent += 2;
    this.taskTargets(task).emit(SocketEvents.TASK_ASSIGNED, task);
    this.server.to(`user:${workerId}`).emit(SocketEvents.TASK_ASSIGNED, task);
  }

  /*
    "Something on this job changed" — a checklist tick, an owner, a file, a
    dependency, somebody joining the crew. ⚠️ task-service has emitted
    `task_updated` from fourteen places and nothing here listened, so no open
    screen ever heard of any of them: a phone showed an item as free after
    somebody had taken it, until its own next tap.

    • THE ID ONLY. Each screen re-reads through its own authorized request; the
      payload carries nothing a room member could not already open.
    • TO WHO COULD SEE IT: the task viewers of its org, its workspace's room
      (cross-org shares), and every person on its crew — a field worker is in
      none of the first two.
    • COALESCED per job: a burst (three people ticking together) is one
      announcement, so an office list is not refetched per tap.
  */
  protected readonly updatePending = new Map<string, ReturnType<typeof setTimeout>>();
  announceTaskChanged(taskId: string, delayMs = 400): void {
    if (!taskId || this.updatePending.has(taskId)) return;
    this.updatePending.set(
      taskId,
      setTimeout(() => {
        this.updatePending.delete(taskId);
        void this.sendTaskChanged(taskId).catch((e) => this.logger.warn(`[EMIT] task.updated ${taskId} failed: ${e}`));
      }, delayMs),
    );
  }

  protected async sendTaskChanged(taskId: string): Promise<void> {
    const task = await jobAudience(this.prisma, taskId);
    if (!task) return;
    const people = new Set([task.assignedToId, ...task.assignees.map((a) => a.userId)].filter((x): x is string => !!x));
    let target = this.taskTargets(task).to(`task:${task.id}`);
    for (const id of people) target = target.to(`user:${id}`);
    this.messagesSent++;
    target.emit(SocketEvents.TASK_UPDATED, { id: task.id, task: { id: task.id } });
    this.logger.debug(`[EMIT] task.updated ${task.id} → viewers, space, ${people.size} on the crew`);
  }

  emitTaskUpdated(task: TaskPayload) {
    this.logger.log(`[EMIT] task.updated to org:${task.organizationId}`);
    this.messagesSent++;
    this.taskTargets(task).emit(SocketEvents.TASK_UPDATED, task);
    if (task.assignedToId) {
      this.messagesSent++;
      this.server.to(`user:${task.assignedToId}`).emit(SocketEvents.TASK_UPDATED, task);
    }
  }

  emitTaskDeclined(task: TaskPayload, declinedBy: unknown) {
    const by = declinedBy as DeclinedBy;
    this.logger.log(
      `[EMIT] task.declined to org:${task.organizationId} (declined by: ${by?.firstName} ${by?.lastName})`,
    );
    this.messagesSent += 2;
    // Notify the organization (dispatcher and client will see this)
    this.server.to(`taskviewers:${task.organizationId}`).emit(SocketEvents.TASK_DECLINED, { task, declinedBy });
    // Notify anyone watching this specific task
    this.server.to(`task:${task.id}`).emit(SocketEvents.TASK_DECLINED, { task, declinedBy });
  }

  emitTaskStatusChanged(task: TaskPayload, oldStatus: string, newStatus: string) {
    this.logger.log(`[EMIT] task.statusChanged (${oldStatus} -> ${newStatus}) to task:${task.id}`);
    this.messagesSent++;
    const payload = { task, oldStatus, newStatus };
    // Single emit across the task room + org taskviewers + shared-space room + the
    // creator's own room. The creator room lets a portal CUSTOMER (confined to
    // user:{id}) watch their request update live; Socket.IO dedups a staff creator
    // who is also a taskviewer.
    let target = this.server.to(`task:${task.id}`).to(`taskviewers:${task.organizationId}`);
    if (task.spaceId) target = target.to(`space:${task.spaceId}`);
    if (task.createdById) target = target.to(`user:${task.createdById}`);
    target.emit(SocketEvents.TASK_STATUS_CHANGED, payload);
  }

  emitCommentAdded(taskId: string, comment: unknown) {
    this.logger.log(`[EMIT] task.commentAdded to task:${taskId}`);
    this.messagesSent++;
    this.server.to(`task:${taskId}`).emit(SocketEvents.TASK_COMMENT_ADDED, { taskId, comment });
  }

  emitAttachmentAdded(taskId: string, attachment: unknown) {
    this.logger.log(`[EMIT] task.attachmentAdded to task:${taskId}`);
    this.messagesSent++;
    this.server.to(`task:${taskId}`).emit(SocketEvents.TASK_ATTACHMENT_ADDED, { taskId, attachment });
  }

  emitWorkerLocationUpdated(organizationId: string, workerId: string, location: unknown) {
    // Without an org, we cannot scope the broadcast — drop it rather than leak
    // it platform-wide (the old global `role:ADMIN` room was the C5 leak).
    if (!organizationId) return;
    // Throttle: GPS points can arrive every few seconds — the live map only
    // needs ~1 update / 3s per worker, so we drop the in-between broadcasts.
    const now = Date.now();
    if (now - (this.lastLocationEmit.get(workerId) || 0) < 3000) return;
    this.lastLocationEmit.set(workerId, now);

    this.logger.debug(`[EMIT] worker.locationUpdated for worker ${workerId}`);
    this.messagesSent++;
    // Live-map viewers = admins of THIS org only. Historical points are still
    // stored by tracking-service regardless of this throttle.
    this.server.to(`role:${organizationId}:ADMIN`).emit(SocketEvents.WORKER_LOCATION_UPDATED, { workerId, location });
  }

  /**
   * A space changed (created / edited / archived / deleted). Org-wide, because
   * every member's space list may be affected; the client re-reads through its
   * own scoped endpoints, so this carries an id, not the space itself.
   */
  emitSpaceChanged(organizationId: string, spaceId: string | null) {
    this.logger.debug(`[EMIT] space.changed for org ${organizationId}`);
    this.messagesSent += 1;
    this.server.to(`org:${organizationId}`).emit(SocketEvents.SPACE_CHANGED, { spaceId });
  }

  /**
   * A document type changed — including WHO MAY SEE IT.
   *
   * Org-wide, and deliberately carrying only an id: each client re-reads through
   * its own scoped endpoints, so a member whose role cannot see the type learns
   * nothing from the event itself. Broadcasting the type would hand them the
   * label of a payslip category they are not allowed to know exists.
   */
  emitDocumentTypesChanged(organizationId: string, typeId: string | null) {
    this.logger.debug(`[EMIT] documents.typesChanged for org ${organizationId}`);
    this.messagesSent += 1;
    this.server.to(`org:${organizationId}`).emit(SocketEvents.DOCUMENT_TYPES_CHANGED, { typeId });
  }

  /** Someone was added to or removed from a space's roster. */
  emitSpaceRosterChanged(organizationId: string, spaceId: string | null) {
    this.logger.debug(`[EMIT] space.rosterChanged for org ${organizationId}`);
    this.messagesSent += 1;
    this.server.to(`org:${organizationId}`).emit(SocketEvents.SPACE_ROSTER_CHANGED, { spaceId });
  }
}
