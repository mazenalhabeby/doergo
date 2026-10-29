import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { memberMayDelete, PrismaService } from '@hbcfield/shared';
import { type DocumentActor, type RequestContext } from '../core/document-common';
import { DocumentStorageService } from '../core/document-storage.service';

/**
 * A member removing something they supplied themselves.
 *
 * Only ever their own, only ever SUPPLIED, and only while it waits for review
 * or after it was refused. The deletion is witnessed in the activity log (the
 * document's own trail dies with it) and the file is freed with the row.
 */
export async function withdrawOwnDocument(
  prisma: PrismaService,
  storage: DocumentStorageService,
  data: { actor: DocumentActor; documentId: string; ctx?: RequestContext },
) {
  const document = await prisma.document.findFirst({
    where: {
      id: data.documentId,
      organizationId: data.actor.organizationId,
      userId: data.actor.userId,
      // Hidden by the office means gone from the member's file: not theirs to touch (404).
      hiddenFromMember: false,
    },
    select: {
      id: true,
      title: true,
      status: true,
      issuedById: true,
      storageKey: true,
      originalKey: true,
      type: { select: { direction: true, label: true } },
    },
  });
  if (!document) throw new NotFoundException('Document not found');

  // On a BOTH type only their OWN upload: a copy the office filed carries `issuedById`.
  if (!memberMayDelete(document.type.direction, document.issuedById === null)) {
    throw new ForbiddenException('This document was issued to you and cannot be removed');
  }
  // Once the office accepted it, it is the organization's record — the
  // member's withdrawal window is while it waits for review (or was refused).
  if (!(OWN_WITHDRAWABLE as readonly string[]).includes(document.status)) throw ownAlreadyAccepted();

  await prisma.$transaction(async (tx) => {
    // The document's own trail dies with it, so the witness is written here.
    await tx.activityLog.create({
      data: {
        eventType: 'DOCUMENT_DELETED',
        userId: data.actor.userId,
        targetUserId: data.actor.userId,
        organizationId: data.actor.organizationId,
        resourceType: 'documents',
        resourceId: document.id,
        ipAddress: data.ctx?.ip ?? null,
        userAgent: data.ctx?.userAgent ?? null,
        metadata: {
          title: document.title,
          type: document.type.label,
          previousStatus: document.status,
          ownUpload: true,
        },
      },
    });
    // Conditional: a review landing at the same moment wins over the withdrawal.
    const gone = await tx.document.deleteMany({
      where: { id: document.id, status: { in: [...OWN_WITHDRAWABLE] } },
    });
    if (gone.count === 0) throw ownAlreadyAccepted();
  });

  // The file goes too — unless another row still points at the same bytes
  // (content-addressed), which the storage check asks. Never throws.
  await storage.freeStorageIfUnreferenced(document.storageKey);
  if (document.originalKey && document.originalKey !== document.storageKey) {
    await storage.freeStorageIfUnreferenced(document.originalKey);
  }
  return { success: true };
}

/** A member may withdraw their own upload only while it waits for review, or after it was refused. */
const OWN_WITHDRAWABLE = ['PENDING_VERIFICATION', 'REJECTED'] as const;

function ownAlreadyAccepted() {
  return new ForbiddenException({
    message: 'This document was already accepted by your organization and cannot be removed.',
    code: 'OWN_DOCUMENT_ALREADY_ACCEPTED',
  });
}
