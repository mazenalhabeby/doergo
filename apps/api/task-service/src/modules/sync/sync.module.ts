import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncPullService } from './sync-pull.service';
import { ChatPullReader } from './chat-pull.reader';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [ChatModule],
  controllers: [SyncController],
  providers: [SyncPullService, ChatPullReader],
})
export class SyncModule {}
