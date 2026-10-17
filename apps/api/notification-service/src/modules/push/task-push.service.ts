import { Inject, Injectable } from '@nestjs/common';
import { msg, type Msg } from '../../i18n/translate';
import { taskStatus } from './push-helpers';
import { PushService } from './push.service';

/** Pushes about jobs: assigned, time to leave, a step changed, a comment. */
@Injectable()
export class TaskPushService {
  @Inject(PushService) private readonly push!: PushService;

  // =========================================================================
  // TASK NOTIFICATIONS
  // =========================================================================

  async sendTaskAssignedPush(technicianId: string, task: { id: string; title: string }) {
    return this.push.sendToUser(
      technicianId,
      { title: msg('task.assigned.title'), body: msg('task.assigned.body', { task: task.title }) },
      { taskId: task.id, type: 'task_assigned' },
    );
  }

  /**
   * "Leave now" — the nudge that makes an appointment time worth setting.
   *
   * Says the arrival time as well as the departure, because a member reading
   * this on a lock screen needs to know what they are being hurried towards,
   * and says when the drive is only an estimate.
   */
  async sendDepartureDuePush(
    userId: string,
    task: { id: string; title: string },
    detail: { dueTime: string; travelMinutes: number; estimated: boolean },
  ) {
    const params = { task: task.title, time: detail.dueTime, minutes: detail.travelMinutes };
    return this.push.sendToUser(
      userId,
      {
        title: msg('task.departure.title'),
        body: msg(detail.estimated ? 'task.departure.bodyEstimated' : 'task.departure.body', params),
      },
      { taskId: task.id, type: 'task_departure_due' },
    );
  }

  async sendStatusChangePush(userId: string, task: { id: string; title: string }, newStatus: string) {
    return this.push.sendToUser(
      userId,
      {
        title: msg('task.statusChanged.title'),
        body: msg('task.statusChanged.body', { task: task.title, status: taskStatus(newStatus) }),
      },
      { taskId: task.id, type: 'status_change', status: newStatus },
    );
  }

  async sendTaskCommentPush(userId: string, task: { id: string; title: string }, commenterName: string | Msg) {
    return this.push.sendToUser(
      userId,
      { title: msg('task.comment.title'), body: msg('task.comment.body', { name: commenterName, task: task.title }) },
      { taskId: task.id, type: 'comment_added' },
    );
  }
}
