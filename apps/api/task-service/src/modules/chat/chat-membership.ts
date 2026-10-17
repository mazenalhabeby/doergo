import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Is `userId` in this conversation? Throws when not — membership is the grant
 * to read a thread, its files and its receipts.
 *
 * The counterpart's contact fields come back with the membership read rather
 * than in a query of their own: the send-time check needs exactly these, and
 * the conversation carries its own authorization anchor (originSpaceId).
 */
export async function findMembership(prisma: PrismaService, conversationId: string, userId: string) {
  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    include: {
      conversation: {
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true, organizationId: true, role: true, isActive: true,
                  contactable: true, canManageUsers: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!membership) throw new ForbiddenException('Not a member of this conversation');
  return membership;
}

export type ChatMembership = Awaited<ReturnType<typeof findMembership>>;

/** A member's contact fields as findMembership reads them — what the send-time reach check needs. */
export type ChatMemberContact = NonNullable<ChatMembership['conversation']['members'][number]['user']>;
