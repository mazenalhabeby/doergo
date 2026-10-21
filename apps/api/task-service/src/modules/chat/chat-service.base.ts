import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { ChatTasksService } from './chat-tasks.service';
import { findMembership } from './chat-membership';
import { ChatCountersService } from './chat-counters.service';
import { ChatReachService } from './chat-reach.service';
import { ChatCrossOrgService } from './chat-cross-org.service';
import { ChatFilesService } from './chat-files.service';

/** What every chat path shares: being a member of the conversation. */
@Injectable()
export abstract class ChatServiceBase {

  constructor(
    protected readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION) protected readonly notificationClient: ClientProxy,
    protected readonly counters: ChatCountersService,
    protected readonly reach: ChatReachService,
    protected readonly crossOrg: ChatCrossOrgService,
    protected readonly files: ChatFilesService,
    protected readonly tasks: ChatTasksService,
  ) {}


  // ── helpers ──────────────────────────────────────────────────────────────────

  /** Membership is the grant (chat-membership.ts); kept as a method so callers and specs share one seam. */
  protected assertMember(conversationId: string, userId: string) {
    return findMembership(this.prisma, conversationId, userId);
  }
}
