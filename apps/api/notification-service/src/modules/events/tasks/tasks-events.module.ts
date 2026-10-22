import { Module } from '@nestjs/common';
import { EmailModule } from '../../email/email.module';
import { InboxModule } from '../../inbox/inbox.module';
import { PushModule } from '../../push/push.module';
import { WebsocketModule } from '../../websocket/websocket.module';
import { RoleTaskNotificationHandler } from './role-task-notification.handler';
import { CrewNotificationHandler } from './crew-notification.handler';
import { TaskLiveHandler } from './task-live.handler';
import { TaskNotificationHandler } from './task-notification.handler';

/** A job's events: assigned, moved, commented, open to a role, its crew — push, bell and the live job page. */
@Module({
  imports: [EmailModule, InboxModule, PushModule, WebsocketModule],
  controllers: [RoleTaskNotificationHandler, CrewNotificationHandler, TaskLiveHandler, TaskNotificationHandler],
})
export class TasksEventsModule {}
