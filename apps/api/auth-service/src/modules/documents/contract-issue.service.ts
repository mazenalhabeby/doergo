import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { personName, retentionUntil, isBlocking, renderTemplate, missingRequired } from '@hbcfield/shared';
import { documentKey, sha256 } from '@hbcfield/shared/storage';
import { renderContractPdf } from './contract-pdf';
import {
  type DocumentActor,
  typeScope,
  type RequestContext,
  assertCanIssue,
  contractValues,
  type ContractTerms,
  eventContext,
} from './document-common';
import { CONTRACT_MEMBER_SELECT } from './document-templates-helpers';
import { DocumentTemplatesBase } from './document-templates.base';

/**
 * Issuing a contract from a template: filled with the member's and the company's
 * values, rendered, filed and routed for signing.
 */
@Injectable()
export class ContractIssueService extends DocumentTemplatesBase {

  /**
   * Render a contract for one member and issue it.
   *
   * RENDER ONCE, HASH, FREEZE. The PDF is produced here, hashed, and stored;
   * it is never regenerated. Re-rendering on view would let a later template
   * edit silently produce a different file, and the hash recorded against the
   * document — the thing that proves it has not been altered — would stop
   * matching for reasons nobody could explain.
   */
  async issueFromTemplate(data: {
    actor: DocumentActor;
    userId: string;
    templateId?: string;
    /** Terms that are not on the member record. */
    contract?: ContractTerms;
    ctx?: RequestContext;
  }) {
    assertCanIssue(data.actor);
    const store = this.storage.requireStore();

    const member = await this.prisma.user.findFirst({
      where: { id: data.userId, organizationId: data.actor.organizationId },
      select: CONTRACT_MEMBER_SELECT,
    });
    if (!member) throw new NotFoundException('Member not found');

    const template = data.templateId
      ? await this.prisma.documentTemplate.findFirst({
          where: {
            id: data.templateId,
            organizationId: data.actor.organizationId,
            isActive: true,
          },
          include: { type: { select: { id: true, label: true, retentionMonths: true } } },
        })
      : await this.resolveTemplate({
          organizationId: data.actor.organizationId,
          roleId: member.memberRoleId,
          position: member.position,
        });

    if (!template) {
      throw new BadRequestException(
        'No contract template applies to this member. Create one under Document templates.',
      );
    }

    const issuedAt = new Date();

    /*
      The passport number comes off the passport, and the signer off the person
      signing.

      ⚠️ Only from a VERIFIED identity document. A number read off a photograph
      somebody uploaded an hour ago and nobody has looked at yet would go onto a
      letter presented at a border with the organization's name on it — the one
      place a misread digit is expensive. Until a reviewer has confirmed it, the
      token stays empty and the issue is refused with the field named, which is
      a person being told what to do rather than a wrong letter going out.

      Newest first: a renewed passport supersedes the old one, and the old row
      stays for history.
    */
    const identity = await this.prisma.document.findFirst({
      where: {
        userId: member.id,
        organizationId: data.actor.organizationId,
        /*
          `documentNumber` IS the identity test, and a better one than the type.

          It is only ever written by the scan, off a machine-readable zone or a
          barcode — which a passport and an ID card have and a gas certificate
          does not. Matching on the type's key instead would miss every
          organization that renamed "Passport" to "Reisepass", which is most of
          them.
        */
        documentNumber: { not: null },
        verifiedAt: { not: null },
        /*
          ⚠️ SCOPED, like every other read of somebody else's document.

          `document-scope-guard.spec.ts` caught this one on the way in, and it
          was right to. `canIssueDocuments` says who may send a document out; it
          does not say whose passport somebody may read. A clerk who issues
          letters but is not granted the identity type would otherwise have that
          member's passport number lifted onto a letter under their name —
          reading, by way of a feature that does not look like reading.

          Out of scope means the token stays empty and the issue is refused with
          the field named, which is the same outcome as no passport on file.
        */
        ...typeScope(data.actor),
      },
      orderBy: { issuedAt: 'desc' },
      select: { documentNumber: true, issuingState: true },
    });

    const issuer = await this.prisma.user.findFirst({
      where: { id: data.actor.userId },
      select: { firstName: true, lastName: true, position: true },
    });

    const values = contractValues(member, data.contract, issuedAt, { identity, issuer });

    const missing = missingRequired(values);
    if (missing.length > 0) {
      // Refusing beats issuing a contract with a blank where a start date
      // belongs — a document that looks complete and is not.
      throw new BadRequestException(
        `This contract cannot be issued yet — missing: ${missing.join(', ')}`,
      );
    }

    const { text, missing: unfilled } = renderTemplate(template.body, values);
    if (unfilled.length > 0) {
      throw new BadRequestException(`Template fields have no value: ${unfilled.join(', ')}`);
    }

    const title = `${template.type.label} — ${member.firstName} ${member.lastName}`.trim();
    const pdf = await renderContractPdf({
      title: template.type.label,
      body: text,
      issuedAt,
      organizationName: member.organization?.name ?? '',
      memberName: personName(member),
    });

    const hash = sha256(pdf);
    const key = documentKey(data.actor.organizationId, hash, 'pdf');
    await this.storage.withStorage('storing a contract', () => store.put(key, pdf, 'application/pdf'));

    const document = await this.prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          organizationId: data.actor.organizationId,
          userId: member.id,
          typeId: template.typeId,
          templateId: template.id,
          title,
          storageKey: key,
          sha256: hash,
          // The contract as rendered, before anybody signs it — see confirmUpload.
          originalKey: key,
          originalSha256: hash,
          sizeBytes: pdf.length,
          mimeType: 'application/pdf',
          status: isBlocking(template.signatureMode) ? 'AWAITING_SIGNATURE' : 'ISSUED',
          issuedById: data.actor.userId,
          issuedAt,
          retentionUntil: retentionUntil(issuedAt, template.type.retentionMonths),
        },
      });
      await tx.documentEvent.create({
        data: {
          documentId: created.id,
          type: 'ISSUED',
          actorId: data.actor.userId,
          meta: { templateId: template.id, templateVersion: template.version },
          ...eventContext(data.ctx),
        },
      });
      return created;
    });

    this.notifier.notifyIssued(
      document.id,
      member,
      template.type.label,
      title,
      isBlocking(template.signatureMode),
    );
    return document;
  }
}
