import { SocketEventsController } from './socket-events.controller';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebsocketGateway } from './websocket.gateway';

@Module({
  controllers: [SocketEventsController],
  imports: [ConfigModule],
  providers: [WebsocketGateway],
  exports: [WebsocketGateway],
})
export class WebsocketModule {}
