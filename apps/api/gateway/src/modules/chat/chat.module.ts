import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatReachLookup } from './chat-reach.lookup';

// SERVICE_NAMES.TASK ClientProxy is provided globally (MicroservicesModule).
@Module({
  controllers: [ChatController],
  providers: [ChatService, ChatReachLookup],
  exports: [ChatService, ChatReachLookup],
})
export class ChatModule {}
