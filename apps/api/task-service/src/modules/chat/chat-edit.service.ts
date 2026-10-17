import { BadRequestException, Inject, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, mayChangeMessage, CHAT_EDIT_WINDOW_MINUTES } from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CHAT_USER_SELECT, previewOf, visibleMessage } from './chat-shape';
import { findMembership } from './chat-membership';
import { ChatReachService } from './chat-reach.service';
import { ChatFilesService } from './chat-files.service';
import { ChatTasksService } from './chat-tasks.service';
import type { TaskAccessFacts } from '../../common/task-access/task-access.service';

/**
 * Changing what you said: edit or remove YOUR message, for a short while after
 * sending it (shared `mayChangeMessage`, the same rule the apps use to offer
 * the action). A removed message keeps its place and loses its words.
 *
 * The same right to write that sending needs is asked again — editing is
 * writing — so a closed cross-company thread cannot be edited into either.
 * Every member's screen is told (`chat_message_changed`), and the list row
 * follows when it was the newest message.
 */
@Injectable()
export class ChatEditService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
    private readonly reach: ChatReachService,
    private readonly files: ChatFilesService,
    private readonly tasks: ChatTasksService,
  ) {}

  edit(data: { messageId: string; userId: string; body: string; facts?: TaskAccessFacts }) {
    const body = (data.body ?? '').trim();
    if (!body) throw new BadRequestException('An edited message needs words — remove it instead');
    return this.change(data.messageId, data.userId, { body, editedAt: new Date() }, previewOf(body), data.facts);
  }

  remove(data: { messageId: string; userId: string; facts?: TaskAccessFacts }) {
    return this.change(
      data.messageId,
      data.userId,
      { body: '', attachments: [], deletedAt: new Date() },
      '',
      data.facts,
    );
  }

  private async change(
    messageId: string,
    userId: string,
    patch: Record<string, unknown>,
    preview: string,
    facts?: TaskAccessFacts,
  ) {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    // Somebody else's message reads the same as one that does not exist — and so
    // does a SYSTEM line, which carries its actor as sender but is nobody's words.
    if (!msg || msg.senderId !== userId || msg.kind === 'SYSTEM') throw new NotFoundException('Message not found');
    if (
      !mayChangeMessage(
        { ...msg, createdAt: msg.createdAt.toISOString(), deletedAt: msg.deletedAt?.toISOString() ?? null },
        userId,
      )
    ) {
      throw new ForbiddenException(
        `A message can be changed for ${CHAT_EDIT_WINDOW_MINUTES} minutes after it was sent`,
      );
    }
    const membership = await findMembership(this.prisma, msg.conversationId, userId);
    await this.reach.assertStillReachable(membership, userId);
    await this.tasks.assertMayWrite(membership, facts);

    const [saved] = await this.prisma.$transaction([
      this.prisma.message.update({ where: { id: messageId }, data: patch, include: { sender: CHAT_USER_SELECT } }),
      // Only the newest message is the list row's preview.
      this.prisma.conversation.updateMany({
        where: { id: msg.conversationId, lastMessageId: messageId },
        data: { lastMessagePreview: preview },
      }),
    ]);
    const [message] = await this.files.signMessages(membership.conversation, [visibleMessage(saved)]);
    this.notificationClient.emit('chat_message_changed', {
      conversationId: msg.conversationId,
      message,
      memberIds: membership.conversation.members.map((m) => m.userId),
    });
    return { success: true, data: message };
  }
}
