import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  personName,
  renderTemplate,
  unknownTokens,
  type SignatureMode,
  MERGE_FIELDS,
  toISODateString,
} from '@hbcfield/shared';
import { renderContractPdf } from './contract-pdf';
import { type DocumentActor, assertCanManageTypes, contractValues } from './document-common';
import { CONTRACT_MEMBER_SELECT } from './document-templates-helpers';
import { DocumentTemplatesBase } from './document-templates.base';

@Injectable()
export class DocumentTemplatesService extends DocumentTemplatesBase {

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

    const select = CONTRACT_MEMBER_SELECT;

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
      : { 'contract.issuedOn': toISODateString(issuedAt) };

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

    const memberName = member ? personName(member) : '';

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
