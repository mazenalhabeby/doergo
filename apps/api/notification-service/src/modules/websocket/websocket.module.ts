import { SocketEventsController } from './socket-events.controller';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebsocketGateway } from './websocket.gateway';
import { ChatEvents } from './chat-events';
import { MemberEvents } from './member-events';
import { PresenceService } from './presence.service';
import { SocketAuthenticator } from './socket-authenticator';
import { SocketRegistry } from './socket-registry';
import { SocketTokens } from './socket-tokens';
import { SupportEvents } from './support-events';
import { TaskEvents } from './task-events';
import { TaskRooms } from './task-rooms';

@Module({
  controllers: [SocketEventsController],
  imports: [ConfigModule],
  providers: [
    SocketRegistry,
    SocketTokens,
    PresenceService,
    SocketAuthenticator,
    TaskRooms,
    TaskEvents,
    ChatEvents,
    SupportEvents,
    MemberEvents,
    WebsocketGateway,
  ],
  exports: [WebsocketGateway],
})
export class WebsocketModule {}
