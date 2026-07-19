import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

// SERVICE_NAMES.TASK ClientProxy is provided globally (MicroservicesModule).
@Module({
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
