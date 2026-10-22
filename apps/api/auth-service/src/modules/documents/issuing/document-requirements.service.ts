import { Injectable, NotFoundException } from '@nestjs/common';
import { personName, requirementStatuses, waitingOnMember, isCurrentSigner, type SignerStep } from '@hbcfield/shared';
import { type DocumentActor } from '../core/document-common';
import { DocumentSupplyBase } from './document-supply.base';

/** What is required OF a member, and what waits ON them. */
@Injectable()
export class DocumentRequirementsService extends DocumentSupplyBase {

  /**
   * What a member still owes the organization, and whose turn it is.
   *
   * A separate call rather than a field on the document list, because it is a
   * different question: the list says what somebody HAS, this says what they
   * have not. The compliance board could only ever show the first, which is why
   * the technician who uploaded nothing was invisible on it.
   *
   * Reading your own is free, like the list itself. Reading somebody else's
   * needs the same grant that lets you see their documents exist.
   */
  async listRequirements(data: { actor: DocumentActor; targetUserId?: string }) {
    const targetUserId = data.targetUserId ?? data.actor.userId;
    const isSelf = targetUserId === data.actor.userId;

    // 404, not 403: a refusal would confirm the person exists here.
    if (!isSelf && !data.actor.canViewMemberDocuments) {
      throw new NotFoundException('Member not found');
    }

    const member = await this.prisma.user.findFirst({
      where: { id: targetUserId, organizationId: data.actor.organizationId },
      // isExternal: we ask nothing of somebody else's employee — see requirementsFor.
      select: { id: true, memberRoleId: true, isExternal: true },
    });
    if (!member) throw new NotFoundException('Member not found');

    const [types, held] = await Promise.all([
      this.prisma.documentType.findMany({
        where: { organizationId: data.actor.organizationId, isActive: true, direction: { in: ['SUPPLIED', 'BOTH'] } },
      }),
      this.prisma.document.findMany({
        where: { organizationId: data.actor.organizationId, userId: targetUserId },
        select: { typeId: true, status: true, expiresOn: true },
      }),
    ]);

    // The rule itself is shared and pure — the member's screen, this endpoint
    // and the compliance board all read the same one, so they cannot disagree
    // about whether somebody is covered.
    return requirementStatuses(member, types, held);
  }

  /**
   * Everything personally outstanding, in one answer.
   *
   * The member's own obligations come in two kinds that live in different
   * places — types the organization asks them to SUPPLY, and documents already
   * issued to them that are AWAITING SIGNATURE — and a reminder that only knows
   * about one of them is worse than no reminder, because it reads as a complete
   * statement of what is left.
   *
   * Self only: there is no `targetUserId`. This is the summary behind a badge on
   * somebody's own screen, and an endpoint that will happily summarise a
   * colleague's obligations is an endpoint that leaks who is behind on what.
   *
   * The SAME TWO QUERIES `listRequirements` already makes, so a screen showing
   * both kinds costs exactly what showing one kind cost — `held` is every
   * document the member has, and the ones awaiting a signature were always in
   * it, merely thrown away.
   */
  async pendingForMember(data: { actor: DocumentActor }) {
    const member = await this.prisma.user.findFirst({
      where: { id: data.actor.userId, organizationId: data.actor.organizationId },
      // isExternal: we ask nothing of somebody else's employee — see requirementsFor.
      select: { id: true, memberRoleId: true, isExternal: true },
    });
    if (!member) throw new NotFoundException('Member not found');

    const [types, held] = await Promise.all([
      this.prisma.documentType.findMany({
        where: { organizationId: data.actor.organizationId, isActive: true, direction: { in: ['SUPPLIED', 'BOTH'] } },
      }),
      this.prisma.document.findMany({
        where: { organizationId: data.actor.organizationId, userId: data.actor.userId },
        select: {
          id: true,
          title: true,
          typeId: true,
          status: true,
          expiresOn: true,
          hiddenFromMember: true,
          // Same reason as the documents list: with a route, AWAITING_SIGNATURE
          // means somebody has to sign, not that THIS person does.
          signers: { select: { order: true, role: true, status: true, userId: true, eligibleUserIds: true, customerId: true } },
        },
        orderBy: { issuedAt: 'desc' },
      }),
    ]);

    const assigned = await this.chain.documentsWaitingOnMe(data.actor);
    const statuses = requirementStatuses(member, types, held);

    return {
      // Both filtered with the shared rules, so this agrees with the member's
      // own documents screen rather than offering a second opinion.
      toUpload: statuses.filter((r) => waitingOnMember(r)),
      expiring: statuses.filter((r) => r.state === 'EXPIRING'),
      toSign: [
        ...held
          .filter(
            (d) =>
              // A hidden document still counts as held for requirements, but
              // it is never asked of the member it was hidden from.
              !d.hiddenFromMember &&
              d.status === 'AWAITING_SIGNATURE' &&
              ((d.signers ?? []).length === 0 ||
                isCurrentSigner((d.signers ?? []) as unknown as SignerStep[], data.actor.userId)),
          )
          .map((d) => ({ id: d.id, title: d.title, forMember: null as string | null })),
        // Somebody else's, waiting on me. Named, because "Time sheet September"
        // on a manager's list is nine identical rows without the member.
        ...assigned.map((d) => ({
          id: d.id,
          title: d.title,
          forMember: personName(d.user),
        })),
      ],
    };
  }
}
