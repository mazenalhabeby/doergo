import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';

@Module({
  imports: [ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)])],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
