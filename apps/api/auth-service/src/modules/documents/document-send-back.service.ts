import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { nextPendingStep, maySignStep } from '@hbcfield/shared';
import {
  type DocumentActor,
  assertTypeVisible,
  assertNotHiddenDraft,
  type RequestContext,
  eventContext,
} from './document-common';
import { DocumentSigningBase } from './document-signing.base';

/**
 * Sending a document back for changes instead of signing it — the reason, the
 * chain reset, who is told.
 */
@Injectable()
export class DocumentSendBackService extends DocumentSigningBase {
  /**
   * Send a document back to an earlier signer, with a reason.
   *
   * The alternative — revoke and re-issue — throws away the chain, so the
   * worker signs a NEW document and the record of the first attempt disappears.
   * Sending back keeps one document and one history: the earlier step goes
   * pending again, everything after it goes pending again, and the trail says
   * why.
   *
   * Only the person currently being waited on may do it. Anybody else "sending
   * back" would be reaching into a document that is not in their hands.
   *
   * The signatures already collected are NOT deleted. They are what happened;
   * the seals that carry them remain valid for the versions they described, and
   * re-signing adds to the chain rather than rewriting it.
   */
  async sendBack(data: { actor: DocumentActor; documentId: string; reason: string; ctx?: RequestContext }) {
    const reason = (data.reason ?? '').trim();
    if (reason.length < 3) {
      throw new BadRequestException('Say why you are sending it back');
    }

    /*
      Same door as sign / consent / acknowledge.

      This read was scoped by `typeScope`, which has no routed-signer
      exemption — so a shift leader on the step of a restricted type could sign
      it and not send it back. And it compared `current.userId`, which is null
      on a POOL step ("whoever is free signs") until somebody signs, so nobody
      in a pool could ever send back. Turn first (`maySignStep`, the rule the
      signing path reads), then the type with the routed-signer exemption.
    */
    const document = await this.prisma.document.findFirst({
      where: {
        id: data.documentId,
        organizationId: data.actor.organizationId,
        // Hidden from its member means not theirs to act on, whatever the route.
        NOT: { userId: data.actor.userId, hiddenFromMember: true },
      },
      select: {
        id: true,
        title: true,
        userId: true,
        status: true,
        hiddenFromMember: true,
        rolesOverridden: true,
        visibleToRoleIds: true,
        type: { select: { visibleToRoleIds: true } },
      },
    });
    if (!document) throw new NotFoundException('Document not found');
    assertNotHiddenDraft(data.actor, document);

    const steps = await this.lookup.signerSteps(document.id);
    const current = nextPendingStep(steps);
    if (!current) throw new BadRequestException('This document is not waiting for a signature.');
    if (!maySignStep(current, data.actor.userId)) {
      throw new ForbiddenException('This document is waiting for somebody else.');
    }
    // On the current step = routed onto it: that is the authorisation to read it.
    assertTypeVisible(data.actor, document, true);

    // The nearest earlier step that actually signed. A skipped one cannot be
    // sent back to — nobody was ever asked.
    const target = [...steps]
      .filter((s) => s.order < current.order && s.status === 'SIGNED')
      .sort((a, b) => b.order - a.order)[0];
    if (!target) {
      throw new BadRequestException('There is no earlier signer to send this back to.');
    }

    await this.prisma.$transaction(async (tx) => {
      // That step and everything after it are pending again. Leaving the
      // in-between steps signed would let the chain skip them on the way back
      // up, and the order is the point.
      await tx.documentSigner.updateMany({
        where: { documentId: document.id, order: { gte: target.order }, status: 'SIGNED' },
        data: { status: 'PENDING', signedAt: null },
      });
      await tx.documentEvent.create({
        data: {
          documentId: document.id,
          type: 'SENT_BACK',
          actorId: data.actor.userId,
          meta: { reason, toStep: target.order },
          ...eventContext(data.ctx),
        },
      });
    });

    await this.notifier.notifyNextSigner(document.id, document.title);
    return { documentId: document.id, backToStep: target.order };
  }
}
