import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { documentKey } from '@hbcfield/shared/storage';
import { personName, SHARED_ROLE_WHERE } from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  type DocumentActor,
  typeScope,
  type RequestContext,
  assertCanIssue,
  boundedIds,
  eventContext,
} from './document-common';
import { DocumentStorageService } from './document-storage.service';

/**
 * Control over a document after it is issued: who sees it, withdrawing it, deleting it.
 *
 * Part of the personnel file; `DocumentsService` is the facade every caller uses.
 */
@Injectable()
export class DocumentControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageService,
  ) {}

  /**
   * Decide who may see these documents.
   *
   * `hiddenFromMember` takes a document out of its subject's file entirely.
   * `roleIds` null puts the documents back under their type's rule; an array
   * REPLACES it for these documents (empty = administrators only). Either may be
   * left undefined to leave that half alone, so the bulk bar can hide without
   * touching roles.
   *
   * ⚠️ The documents are fetched through `typeScope`: nobody may change who sees
   * a document they cannot see themselves, and a document outside that scope is
   * 404 — the same answer as a document that does not exist.
   */
  async setVisibility(data: {
    actor: DocumentActor;
    documentIds: string[];
    hiddenFromMember?: boolean;
    roleIds?: string[] | null;
    ctx?: RequestContext;
  }) {
    if (!data.actor.canManageDocumentVisibility || data.actor.isExternal) {
      throw new ForbiddenException('You cannot change who sees documents');
    }
    const ids = boundedIds(data.documentIds);
    if (data.hiddenFromMember === undefined && data.roleIds === undefined) {
      throw new BadRequestException('Nothing to change');
    }

    let roles: { id: string; name: string }[] | null = null;
    if (Array.isArray(data.roleIds)) {
      const wanted = [...new Set(data.roleIds)];
      if (wanted.length > 50) throw new BadRequestException('Too many roles');
      // Org roles only: a document belongs to a person, not to a site, and the
      // viewer is matched on their ORG role (memberRoleId).
      roles = await this.prisma.accessRole.findMany({
        where: {
          id: { in: wanted },
          organizationId: data.actor.organizationId,
          isActive: true,
          scope: { in: ['ORG', 'BOTH'] },
          ...SHARED_ROLE_WHERE,
        },
        select: { id: true, name: true },
      });
      if (roles.length !== wanted.length) {
        throw new BadRequestException('One of those roles does not exist');
      }
    }

    const docs = await this.prisma.document.findMany({
      where: {
        ...typeScope(data.actor),
        id: { in: ids },
        organizationId: data.actor.organizationId,
        status: { not: 'DRAFT' },
      },
      select: {
        id: true,
        title: true,
        userId: true,
        user: { select: { firstName: true, lastName: true } },
        type: { select: { label: true } },
      },
    });
    if (docs.length !== ids.length) throw new NotFoundException('Document not found');

    const change: Prisma.DocumentUpdateManyMutationInput = {
      ...(data.hiddenFromMember !== undefined ? { hiddenFromMember: data.hiddenFromMember } : {}),
      ...(data.roleIds === null ? { rolesOverridden: false, visibleToRoleIds: [] } : {}),
      ...(roles ? { rolesOverridden: true, visibleToRoleIds: roles.map((r) => r.id) } : {}),
    };
    const meta = {
      ...(data.hiddenFromMember !== undefined ? { hiddenFromMember: data.hiddenFromMember } : {}),
      ...(data.roleIds === null ? { roles: 'type' } : {}),
      ...(roles ? { roles: roles.map((r) => r.name) } : {}),
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.document.updateMany({
        where: { id: { in: ids }, organizationId: data.actor.organizationId },
        data: change,
      });
      await tx.documentEvent.createMany({
        data: docs.map((d) => ({
          documentId: d.id,
          type: 'VISIBILITY_CHANGED' as const,
          actorId: data.actor.userId,
          meta,
          ...eventContext(data.ctx),
        })),
      });
      await tx.activityLog.createMany({
        data: docs.map((d) => ({
          eventType: 'DOCUMENT_VISIBILITY_CHANGED',
          userId: data.actor.userId,
          targetUserId: d.userId,
          organizationId: data.actor.organizationId,
          resourceType: 'documents',
          resourceId: d.id,
          ipAddress: data.ctx?.ip ?? null,
          userAgent: data.ctx?.userAgent ?? null,
          metadata: {
            title: d.title,
            type: d.type.label,
            member: personName(d.user),
            ...meta,
          },
        })),
      });
    });

    return { updated: docs.length };
  }

  /**
   * Erase documents for good — the row, its signatures, its trail and its files.
   *
   * ⚠️ The one operation in this service that destroys evidence, so it is
   * shaped to be hard to do by accident:
   *   - its own permission, held by nobody but administrators until granted;
   *   - scoped by `typeScope`, so you cannot erase what you cannot see (404);
   *   - all-or-nothing: one id out of scope refuses the whole request, rather
   *     than deleting the rest and leaving the caller to guess which survived;
   *   - a signed document needs `confirmSignaturesLost`, the server-side twin of
   *     the tick-box, so a client cannot skip the question;
   *   - the audit rows are written in the SAME transaction as the delete — the
   *     document's own trail dies with it, so this is the only record left, and
   *     a delete that could commit without it would be a delete with no witness.
   */
  async deleteDocuments(data: {
    actor: DocumentActor;
    documentIds: string[];
    confirmSignaturesLost?: boolean;
    ctx?: RequestContext;
  }) {
    if (!data.actor.canDeleteDocuments || data.actor.isExternal) {
      throw new ForbiddenException('You cannot delete documents');
    }
    const ids = boundedIds(data.documentIds);

    const docs = await this.prisma.document.findMany({
      where: { ...typeScope(data.actor), id: { in: ids }, organizationId: data.actor.organizationId },
      select: {
        id: true,
        title: true,
        status: true,
        userId: true,
        storageKey: true,
        originalKey: true,
        user: { select: { firstName: true, lastName: true } },
        type: { select: { label: true } },
        signatures: { select: { signatureKey: true, hashAfter: true } },
      },
    });
    if (docs.length !== ids.length) throw new NotFoundException('Document not found');

    const signatureCount = docs.reduce((n, d) => n + d.signatures.length, 0);
    if ((signatureCount > 0 || docs.some((d) => d.status === 'SIGNED')) && !data.confirmSignaturesLost) {
      throw new BadRequestException(
        'These documents carry signatures. Confirm that the signatures will be lost to delete them.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.activityLog.createMany({
        data: docs.map((d) => ({
          eventType: 'DOCUMENT_DELETED',
          userId: data.actor.userId,
          targetUserId: d.userId,
          organizationId: data.actor.organizationId,
          resourceType: 'documents',
          resourceId: d.id,
          ipAddress: data.ctx?.ip ?? null,
          userAgent: data.ctx?.userAgent ?? null,
          // What it WAS — after this, nothing else remembers.
          metadata: {
            title: d.title,
            type: d.type.label,
            member: personName(d.user),
            previousStatus: d.status,
            signatures: d.signatures.length,
          },
        })),
      });
      // Signers, signatures and events cascade; a newer version that pointed
      // at one of these is set to point at nothing.
      await tx.document.deleteMany({
        where: { id: { in: ids }, organizationId: data.actor.organizationId },
      });
    });

    // Files after the rows, and only those nothing else still points at.
    const org = data.actor.organizationId;
    for (const d of docs) {
      await this.storage.freeStorageIfUnreferenced(d.storageKey);
      if (d.originalKey && d.originalKey !== d.storageKey) await this.storage.freeStorageIfUnreferenced(d.originalKey);
      for (const s of d.signatures) {
        await this.storage.freeStorageIfUnreferenced(documentKey(org, s.hashAfter, 'pdf'));
        await this.storage.freeSignatureImageIfUnreferenced(s.signatureKey);
      }
    }

    return { deleted: docs.length };
  }

  /**
   * Withdraw a document from a member.
   *
   * Marks it REVOKED; it does NOT delete the row or the object. A signed
   * contract that could be erased by the party who issued it would be worth
   * nothing as evidence — which is exactly what makes deletion the wrong verb
   * here. Actual removal happens through retention, on a schedule, per type.
   */
  async revoke(data: { actor: DocumentActor; documentId: string; ctx?: RequestContext }) {
    assertCanIssue(data.actor);

    const document = await this.prisma.document.findFirst({
      where: { ...typeScope(data.actor), id: data.documentId, organizationId: data.actor.organizationId },
    });
    if (!document) throw new NotFoundException('Document not found');

    if (document.status === 'SIGNED') {
      throw new BadRequestException(
        'A signed document cannot be withdrawn. Issue a superseding version instead.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.document.update({
        where: { id: document.id },
        data: { status: 'REVOKED' },
      });
      await tx.documentEvent.create({
        data: {
          documentId: document.id,
          type: 'REVOKED',
          actorId: data.actor.userId,
          ...eventContext(data.ctx),
        },
      });
      return updated;
    });
  }
}
