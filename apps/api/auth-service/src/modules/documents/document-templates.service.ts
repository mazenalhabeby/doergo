import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  retentionUntil,
  isBlocking,
  renderTemplate,
  missingRequired,
  unknownTokens,
  type SignatureMode,
  scoreTemplateBinding,
  MERGE_FIELDS,
} from '@hbcfield/shared';
import { documentKey, sha256 } from '@hbcfield/shared/storage';
import { renderContractPdf } from './contract-pdf';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  type DocumentActor,
  typeScope,
  type RequestContext,
  assertCanIssue,
  assertCanManageTypes,
  EMPLOYER_COMPANY_SELECT,
  contractValues,
  type ContractTerms,
  isoDate,
  eventContext,
} from './document-common';
import { DocumentStorageService } from './document-storage.service';
import { DocumentLookupService } from './document-lookup.service';
import { DocumentNotifierService } from './document-notifier.service';

/**
 * Contract templates, and issuing a contract rendered from one.
 *
 * Part of the personnel file; `DocumentsService` is the facade every caller uses.
 */
@Injectable()
export class DocumentTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageService,
    private readonly lookup: DocumentLookupService,
    private readonly notifier: DocumentNotifierService,
  ) {}

  async listTemplates(data: { actor: DocumentActor; includeInactive?: boolean }) {
    assertCanManageTypes(data.actor);
    return this.prisma.documentTemplate.findMany({
      where: {
        organizationId: data.actor.organizationId,
        ...(data.includeInactive ? {} : { isActive: true }),
      },
      include: {
        type: { select: { id: true, label: true } },
        appliesToRole: { select: { id: true, name: true, slug: true } },
      },
      orderBy: [{ name: 'asc' }],
    });
  }

  async createTemplate(data: {
    actor: DocumentActor;
    typeId: string;
    name: string;
    body: string;
    appliesToRoleId?: string | null;
    appliesToPosition?: string | null;
    signatureMode?: SignatureMode;
    offerValidDays?: number | null;
  }) {
    assertCanManageTypes(data.actor);
    await this.lookup.findTypeOr404(data.typeId, data.actor.organizationId);
    this.assertTemplateBodyIsUsable(data.body);

    return this.prisma.documentTemplate.create({
      data: {
        organizationId: data.actor.organizationId,
        typeId: data.typeId,
        name: data.name.trim(),
        body: data.body,
        appliesToRoleId: data.appliesToRoleId || null,
        appliesToPosition: data.appliesToPosition?.trim() || null,
        signatureMode: data.signatureMode ?? 'IN_APP',
        offerValidDays: data.offerValidDays ?? 14,
      },
    });
  }

  async updateTemplate(data: {
    actor: DocumentActor;
    id: string;
    patch: Partial<{
      name: string;
      body: string;
      appliesToRoleId: string | null;
      appliesToPosition: string | null;
      signatureMode: SignatureMode;
      offerValidDays: number | null;
      isActive: boolean;
    }>;
  }) {
    assertCanManageTypes(data.actor);
    const existing = await this.prisma.documentTemplate.findFirst({
      where: { id: data.id, organizationId: data.actor.organizationId },
    });
    if (!existing) throw new NotFoundException('Template not found');

    if (data.patch.body !== undefined) this.assertTemplateBodyIsUsable(data.patch.body);

    /*
      Editing bumps the version, and documents already issued are untouched.

      A contract is rendered ONCE and frozen; the version is what lets somebody
      later ask which wording a particular person actually signed. Re-rendering
      an issued document from an edited template would change its bytes and
      break the hash that proves it has not been altered.
    */
    return this.prisma.documentTemplate.update({
      where: { id: existing.id },
      data: {
        ...data.patch,
        ...(data.patch.body !== undefined ? { version: existing.version + 1 } : {}),
      },
    });
  }

  async deactivateTemplate(data: { actor: DocumentActor; id: string }) {
    assertCanManageTypes(data.actor);
    const existing = await this.prisma.documentTemplate.findFirst({
      where: { id: data.id, organizationId: data.actor.organizationId },
    });
    if (!existing) throw new NotFoundException('Template not found');
    return this.prisma.documentTemplate.update({
      where: { id: existing.id },
      data: { isActive: false },
    });
  }

  /**
   * The template that applies to a role and a job title.
   *
   * Most specific wins: role AND position, then role alone, then position
   * alone, then the organization default. A template bound to nothing is the
   * fallback, so an organization can start with one contract and get more
   * precise later without re-pointing anything.
   */
  async resolveTemplate(data: {
    organizationId: string;
    roleId?: string | null;
    position?: string | null;
  }) {
    const candidates = await this.prisma.documentTemplate.findMany({
      where: { organizationId: data.organizationId, isActive: true },
      include: { type: { select: { id: true, label: true, retentionMonths: true } } },
    });
    if (candidates.length === 0) return null;

    // The scoring lives in the shared package because the admin screen shows
    // who a template will reach BEFORE it is saved. A second copy here would be
    // a screen that promises one contract and an invitation that issues another.
    const person = { memberRoleId: data.roleId ?? null, position: data.position ?? null };

    const best = candidates
      .map((t) => ({ t, s: scoreTemplateBinding(t, person) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)[0];

    return best?.t ?? null;
  }

  /**
   * The template that applies to an existing member, resolved from their record.
   *
   * A thin wrapper over `resolveTemplate` so the invitation flow does not have
   * to know that the answer depends on `memberRoleId` and `position` — if that
   * ever changes, it changes here.
   */
  async resolveTemplateForMember(organizationId: string, userId: string) {
    const member = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { memberRoleId: true, position: true },
    });
    if (!member) return null;
    return this.resolveTemplate({
      organizationId,
      roleId: member.memberRoleId,
      position: member.position,
    });
  }

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
      select: {
        id: true, firstName: true, lastName: true, email: true,
        position: true, specialty: true, memberRoleId: true,
        employmentStartDate: true,
        employerEntity: { select: EMPLOYER_COMPANY_SELECT },
        organization: {
          select: {
            name: true, addressLine1: true, city: true, postalCode: true,
            country: true, email: true, phone: true,
            legalEntities: { where: { isMain: true }, take: 1, select: EMPLOYER_COMPANY_SELECT },
          },
        },
      },
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
      memberName: `${member.firstName} ${member.lastName}`.trim(),
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

  /**
   * The contract as a PDF, before anybody is bound by it.
   *
   * The editor's on-screen preview is text in a box: right words, wrong
   * typography, no pagination, no idea where the page breaks fall. What a
   * member actually receives is a PDF, and the only way to know a clause has
   * not been orphaned at the foot of page two is to look at the PDF.
   *
   * So this renders through the SAME `renderContractPdf` that issuing uses.
   * A preview produced by a second, friendlier renderer would be a picture of
   * a document nobody will ever be sent.
   *
   * Nothing is stored and no event is written — this is a look, not an issue.
   * Values that a real member has not got (no start date on the record yet) are
   * left as an em dash and reported back, so the hole is visible in the page
   * AND named in the editor rather than discovered at issue time.
   */
  async previewTemplate(data: {
    actor: DocumentActor;
    /** Omit to ask only for the values — the editor does this once per member. */
    body?: string;
    title?: string;
    memberId?: string;
  }): Promise<{
    pdf: string | null;
    values: Record<string, string>;
    filledFor: string | null;
    missing: string[];
  }> {
    assertCanManageTypes(data.actor);

    const select = {
      id: true, firstName: true, lastName: true, email: true,
      position: true, specialty: true, memberRoleId: true,
      employmentStartDate: true,
      employerEntity: { select: EMPLOYER_COMPANY_SELECT },
      organization: {
        select: {
          name: true, addressLine1: true, city: true, postalCode: true,
          country: true, email: true, phone: true,
          legalEntities: { where: { isMain: true }, take: 1, select: EMPLOYER_COMPANY_SELECT },
        },
      },
    } as const;

    // The member the editor is previewing for, or anyone — an organization with
    // no members yet still deserves to see its own contract laid out.
    const member =
      (data.memberId
        ? await this.prisma.user.findFirst({
            where: { id: data.memberId, organizationId: data.actor.organizationId },
            select,
          })
        : null) ??
      (await this.prisma.user.findFirst({
        where: { organizationId: data.actor.organizationId, isActive: true },
        orderBy: { createdAt: 'asc' },
        select,
      }));

    const issuedAt = new Date();
    const resolved = member
      ? contractValues(member, undefined, issuedAt)
      : { 'contract.issuedOn': isoDate(issuedAt) };

    /*
      An em dash for anything the record has not got, and the values go back to
      the editor as well as into the page.

      The screen used to invent them — today's date for a start date, "Your
      company" for the company — so its instant text preview and the PDF quietly
      disagreed about the same contract. One resolver, used by both, is the only
      way those two can agree; and it is the same resolver issuing uses, so what
      the editor shows is what the member gets.
    */
    const values: Record<string, string> = {};
    for (const field of MERGE_FIELDS) {
      const v = resolved[field.token];
      values[field.token] = v === null || v === undefined || v === '' ? '—' : String(v);
    }

    const memberName = member ? `${member.firstName} ${member.lastName}`.trim() : '';

    if (!data.body?.trim()) {
      // Values only. The editor asks for these once per member and renders its
      // live text preview from them without troubling the server per keystroke.
      return { pdf: null, values, filledFor: memberName || null, missing: [] };
    }

    const { missing } = renderTemplate(data.body, resolved);
    const { text } = renderTemplate(data.body, values);

    try {
      const pdf = await renderContractPdf({
        title: data.title?.trim() || 'Contract',
        body: text,
        issuedAt,
        organizationName: member?.organization?.name ?? '',
        memberName,
      });
      return { pdf: pdf.toString('base64'), values, filledFor: memberName || null, missing };
    } catch (error) {
      /*
        The renderer refuses text its font cannot draw, rather than printing
        black squares into a legal document. Here — in the editor, before
        anything is issued — that refusal is exactly the feedback the author
        needs, so it becomes a 400 carrying the offending characters.
      */
      const message = error instanceof Error ? error.message : 'The preview could not be rendered';
      throw new BadRequestException(message);
    }
  }

  /**
   * Reject a template body that could not produce a usable contract.
   *
   * Checked when the template is SAVED, not when it is issued: an administrator
   * writing it can fix a typo immediately, whereas the same error surfacing
   * during an onboarding batch blocks somebody's first day.
   */
  private assertTemplateBodyIsUsable(body: string) {
    if (!body.trim()) throw new BadRequestException('A template needs a body');

    const unknown = unknownTokens(body);
    if (unknown.length > 0) {
      throw new BadRequestException(
        `This template refers to fields that do not exist: ${unknown.join(', ')}`,
      );
    }
  }
}
