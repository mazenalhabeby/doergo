import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatCountersService } from './chat-counters.service';
import { ChatReachService } from './chat-reach.service';
import { ChatCrossOrgService } from './chat-cross-org.service';
import { ChatEditService } from './chat-edit.service';
import { ChatFilesService } from './chat-files.service';
import { ChatGroupsService } from './chat-groups.service';
import { ChatTasksService } from './chat-tasks.service';
import { ChatSearchService } from './chat-search.service';
import { ChatMessagesService } from './chat-messages.service';

/** Everything ChatService needs, in one list for the module and the specs. */
export const CHAT_PROVIDERS = [
  ChatService,
  ChatMessagesService,
  ChatCountersService,
  ChatReachService,
  ChatCrossOrgService,
  ChatEditService,
  ChatFilesService,
  ChatGroupsService,
  ChatTasksService,
  ChatSearchService,
];

@Module({
  imports: [ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)])],
  controllers: [ChatController],
  providers: CHAT_PROVIDERS,
  exports: [ChatService],
})
export class ChatModule {}
