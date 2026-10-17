import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { personName, credentialStanding, isCurrentSigner, type SignerStep } from '@hbcfield/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  type DocumentActor,
  assertTypeVisible,
  typeScope,
  maySeeDrafts,
  assertNotHiddenDraft,
} from './document-common';
import { DocumentLookupService } from './document-lookup.service';
import { DocumentChainService } from './document-chain.service';
import { listRow } from './document-registers-helpers';

/** One member's own file, and one document's evidence trail. */
@Injectable()
export class MemberDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: DocumentLookupService,
    private readonly chain: DocumentChainService,
  ) {}

  async listForMember(data: {
    actor: DocumentActor;
    targetUserId?: string;
    typeId?: string;
    year?: number;
    search?: string;
    includeArchived?: boolean;
  }) {
    const targetUserId = data.targetUserId ?? data.actor.userId;
    const isSelf = targetUserId === data.actor.userId;

    if (!isSelf && !data.actor.canViewMemberDocuments) {
      throw new ForbiddenException('You cannot see other members’ documents');
    }
    if (!isSelf) {
      await this.lookup.assertMemberOfOrg(targetUserId, data.actor.organizationId);
    }

    /*
      Somebody else's file is scoped by document type; your own never is.

      `isSelf` is the distinction the permission check above already draws, so
      the visibility rule hangs off the same fact rather than inventing a second
      idea of whose file this is.
    */
    const where: Prisma.DocumentWhereInput = {
      // Somebody else's file by type and override; your own minus anything
      // hidden from you. The same fragment answers both.
      ...typeScope(data.actor),
      // Both, always. The organization scope is what stops a stale or guessed
      // user id reaching across tenants even when the id is otherwise valid.
      organizationId: data.actor.organizationId,
      userId: targetUserId,
      ...(data.typeId ? { typeId: data.typeId } : {}),
      ...(data.year ? { periodYear: data.year } : {}),
      // Drafts only for who stages them — never the subject (see assertNotHiddenDraft).
      ...(data.includeArchived && maySeeDrafts(data.actor) ? {} : { status: { not: 'DRAFT' as const } }),
      ...(data.search ? { title: { contains: data.search.trim(), mode: 'insensitive' as const } } : {}),
    };

    const documents = await this.prisma.document.findMany({
      where,
      select: {
        id: true,
        title: true,
        typeId: true,
        periodYear: true,
        periodMonth: true,
        status: true,
        sizeBytes: true,
        mimeType: true,
        issuedAt: true,
        expiresOn: true,
        firstOpenedAt: true,
        rejectionReason: true,
        issuedById: true,
        type: { select: { key: true, label: true, signatureMode: true, isCredential: true } },
        // Only what deciding "is this waiting on you" needs. Selected with the
        // documents so the list does not become one query per row.
        signers: { select: { order: true, role: true, status: true, userId: true, eligibleUserIds: true, customerId: true } },
      },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }, { issuedAt: 'desc' }],
      // A personnel file is small by nature; this is a backstop against a
      // pathological account, not real pagination.
      take: 500,
    });

    /*
      Documents that are not in this file but are waiting on this person.

      Only on your OWN list. An admin looking at somebody's personnel file wants
      that file, not a countersignature queue belonging to the person they are
      looking at — mixing the two would make one screen answer two questions and
      neither of them clearly.
    */
    const alsoWaiting =
      isSelf && !data.typeId && !data.year && !data.search ? await this.chain.documentsWaitingOnMe(data.actor) : [];

    const now = new Date();
    /*
      Whose turn it is, from the viewer's side.

      No route: the old meaning is the right one — the document is waiting on
      the person it was issued to. With a route: only while the pending step is
      theirs, which is what stops somebody who has already signed being told to
      sign again with no way to clear it.
    */
    const waitingOnViewer = (d: { status: string; signers?: SignerStep[] }): boolean => {
      if (d.status !== 'AWAITING_SIGNATURE') return false;
      // No rows is not a missing answer, it is the answer: a document issued
      // before routes existed, or under a type that has none. It waits on the
      // person it was issued to, which is what it has always meant.
      const steps = d.signers ?? [];
      if (steps.length === 0) return targetUserId === data.actor.userId;
      return isCurrentSigner(steps, data.actor.userId);
    };
    return [
      // Theirs to sign, first: it is somebody else's document and it is holding
      // up that person's month.
      ...alsoWaiting.map((d) => ({
        ...listRow(d),
        needsSignature: true,
        rejectionReason: null,
        standing: null as string | null,
        // Whose document it is. Without this a manager sees nine rows called
        // "Time sheet September" and cannot tell them apart.
        forMember: personName(d.user),
      })),
      ...documents.map((d) => ({
      ...listRow(d),
      /*
        "Needs your signature" has to mean YOURS.

        A document with a route stays AWAITING_SIGNATURE until the whole chain
        is done, so reading the document's status told a member who had already
        signed that they still had to — with no way to make it go away. The
        chain knows better: where there are steps, this is true only while the
        pending one is theirs.
      */
      needsSignature: waitingOnViewer(d),
      // Their OWN upload (nobody issued it) — on an "either" type, the copy they may replace.
      suppliedByMember: d.issuedById === null,
      // Only ever set on something the member supplied. Shown to them verbatim:
      // "rejected" with no reason is an instruction to upload the same photo.
      rejectionReason: d.rejectionReason,
      /*
        No standing until it counts.

        A PENDING_VERIFICATION licence with a 2030 date is not "valid" — the
        dispatch gate refuses it — and a green tick beside it is the single most
        misleading thing this list could show, because it says the opposite of
        what happens when the person is assigned to work.
      */
      standing:
        d.type.isCredential && d.status !== 'PENDING_VERIFICATION' && d.status !== 'REJECTED'
          ? credentialStanding(d.expiresOn, now)
          : null,
      // Their own file: the document is about them, so there is nobody to name.
      forMember: null as string | null,
      })),
    ];
  }

  /** The evidence trail for one document. */
  async listEvents(data: { actor: DocumentActor; documentId: string }) {
    const document = await this.prisma.document.findFirst({
      where: { id: data.documentId, organizationId: data.actor.organizationId },
      select: { id: true, userId: true, status: true, hiddenFromMember: true, rolesOverridden: true, visibleToRoleIds: true, type: { select: { visibleToRoleIds: true } } },
    });
    if (!document) throw new NotFoundException('Document not found');
    assertNotHiddenDraft(data.actor, document);

    assertTypeVisible(data.actor, document);
    const isSelf = document.userId === data.actor.userId;
    if (!isSelf && !data.actor.canViewMemberDocuments) {
      throw new NotFoundException('Document not found');
    }

    const events = await this.prisma.documentEvent.findMany({
      where: { documentId: document.id },
      orderBy: { at: 'asc' },
      include: {
        actor: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    /*
      Where somebody ELSE was, and on what device, is evidence for the
      organization — not something the subject or a list-only reader is owed.
      Your own lines stay whole; other people's lose ip, device and position
      unless you may open members' documents (or are an administrator).
    */
    if (data.actor.isAdmin || data.actor.canOpenMemberDocuments) return events;
    return events.map((e) =>
      e.actorId === data.actor.userId ? e : { ...e, ip: null, userAgent: null, lat: null, lng: null },
    );
  }
}
