import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PushService } from '../modules/push/push.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';
import { NotificationStore } from '../common/notification-store.service';
import { msg, type LocalizedText } from '../i18n/translate';

/** Tasks open to a work role: offered, taken, nobody took it. */
@Controller()
export class RoleTaskNotificationHandler {
  private readonly logger = new Logger('RoleTaskNotificationHandler');

  constructor(
    private readonly pushService: PushService,
    private readonly websocketGateway: WebsocketGateway,
    private readonly store: NotificationStore,
  ) {}

  /*
    A task OPEN TO A ROLE (packages/shared/src/tasks/role-pool.ts).

    Offered: a push to each person the wave reaches, in their own language, and
    a line in their inbox — the push is gone once swiped, the inbox is where
    "what was I offered?" is answered. Taken / unclaimed go to whoever opened it.
    Pushes are typed `task_role_*`, so a member who switched job pushes off is
    not buzzed (pushCategory → tasks).
  */
  @EventPattern('role_task_offered')
  async handleRoleTaskOffered(@Payload() data: { task: { id: string; title: string; organizationId: string }; roleName: string; userIds: string[]; wave: number }) {
    const ids = [...new Set(data.userIds ?? [])];
    if (ids.length === 0) return;
    this.logger.log(`Role task offered: ${data.task.id} wave ${data.wave} to ${ids.length}`);
    const text: LocalizedText = {
      title: msg('task.roleOffer.title', { role: data.roleName }),
      body: msg('task.roleOffer.body', { task: data.task.title }),
    };
    try {
      await this.pushService.sendToUsers(ids, text, { taskId: data.task.id, type: 'task_role_offer' });
    } catch (error) {
      this.logger.error(`Failed to send role offer push: ${error}`);
    }
    for (const id of ids) this.websocketGateway.emitToUser(id, 'role_task_open', { taskId: data.task.id });
    await this.store.record({
      recipientIds: ids,
      organizationId: data.task.organizationId,
      eventType: 'task.roleOffer',
      text,
      link: `/tasks/${data.task.id}`,
      data: { taskId: data.task.id },
    });
  }

  @EventPattern('role_task_taken')
  async handleRoleTaskTaken(@Payload() data: { task: { id: string; title: string; organizationId: string }; takerName: string; notifyIds: string[] }) {
    const ids = [...new Set(data.notifyIds ?? [])];
    if (ids.length === 0) return;
    const text: LocalizedText = {
      title: msg('task.roleTaken.title'),
      body: msg('task.roleTaken.body', { name: data.takerName, task: data.task.title }),
    };
    try {
      await this.pushService.sendToUsers(ids, text, { taskId: data.task.id, type: 'task_role_taken' });
    } catch (error) {
      this.logger.error(`Failed to send role taken push: ${error}`);
    }
    await this.store.record({
      recipientIds: ids,
      organizationId: data.task.organizationId,
      eventType: 'task.roleTaken',
      text,
      link: `/tasks/${data.task.id}`,
      data: { taskId: data.task.id },
    });
  }

  @EventPattern('role_task_unclaimed')
  async handleRoleTaskUnclaimed(@Payload() data: { task: { id: string; title: string; organizationId: string }; roleName: string; minutes: number; names: string[]; notifyIds: string[] }) {
    const ids = [...new Set(data.notifyIds ?? [])];
    if (ids.length === 0) return;
    const names = (data.names ?? []).slice(0, 3).join(', ');
    const params = { task: data.task.title, role: data.roleName, minutes: data.minutes, names };
    const text: LocalizedText = {
      title: msg('task.roleUnclaimed.title'),
      body: msg(names ? 'task.roleUnclaimed.body' : 'task.roleUnclaimed.bodyNone', params),
    };
    try {
      await this.pushService.sendToUsers(ids, text, { taskId: data.task.id, type: 'task_role_unclaimed' });
    } catch (error) {
      this.logger.error(`Failed to send role unclaimed push: ${error}`);
    }
    await this.store.record({
      recipientIds: ids,
      organizationId: data.task.organizationId,
      eventType: 'task.roleUnclaimed',
      text,
      link: `/tasks/${data.task.id}`,
      data: { taskId: data.task.id },
    });
  }
}
