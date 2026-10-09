import { BadRequestException, Injectable } from '@nestjs/common';
import {
  visibleTypeSelfWhere,
  type DocumentCadence,
  type DocumentDirection,
  type SignatureMode,
  routeProblem,
} from '@hbcfield/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  type DocumentActor,
  assertCanManageTypes,
  assertCanManageVisibility,
  normaliseKey,
  sameIdSet,
} from './document-common';
import { DocumentLookupService } from './document-lookup.service';

/**
 * The document type catalogue: what can be filed, who must supply it, who may see it.
 *
 * Part of the personnel file; `DocumentsService` is the facade every caller uses.
 */
@Injectable()
export class DocumentTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: DocumentLookupService,
  ) {}

  async listTypes(data: {
    organizationId: string;
    includeInactive?: boolean;
    /**
     * The caller, for type visibility.
     *
     * ⚠️ `manage` skips the restriction: configuring types requires seeing all of
     * them, and it is `canManageDocumentTemplates` that grants it — you cannot
     * set who may see a type from a screen that hides it from you.
     */
    roleId?: string | null;
    isAdmin?: boolean;
    manage?: boolean;
    /** For the self-exemptions in `visibleTypeSelfWhere`. */
    userId?: string | null;
  }) {
    return this.prisma.documentType.findMany({
      where: {
        /*
          A filter list must not offer a type whose documents it will not show.

          The same rule as the document queries, read against the types
          themselves and from the same file — a type missing from the register
          while still present in the dropdown is exactly the confusion this
          feature exists to remove.
        */
        ...(data.manage
          ? {}
          : visibleTypeSelfWhere({
              roleId: data.roleId ?? null,
              isAdmin: !!data.isAdmin,
              userId: data.userId ?? null,
            }) ?? {}),
        organizationId: data.organizationId,
        ...(data.includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ position: 'asc' }, { label: 'asc' }],
    });
  }

  /**
   * A card has a reverse; a stack of paper has a page 2.
   *
   * ⚠️ Refused rather than silently coerced. Both set is somebody misreading
   * the editor, and quietly picking a winner means the type behaves one way
   * while its settings screen says another — which is only discovered by a
   * member whose upload asks for the wrong thing.
   */
  private assertPageShape(twoSided?: boolean | null, multiPage?: boolean | null) {
    if (twoSided && multiPage) {
      throw new BadRequestException(
        'A document type is either two-sided or many sheets, not both',
      );
    }
  }

  async createType(data: {
    actor: DocumentActor;
    key: string;
    label: string;
    description?: string | null;
    cadence?: DocumentCadence;
    direction?: DocumentDirection;
    retentionMonths?: number | null;
    signatureMode?: SignatureMode;
    isCredential?: boolean;
    hasExpiry?: boolean;
    requiredForWorkflowIds?: string[];
    requiredFromAll?: boolean;
    requiredFromRoleIds?: string[];
    /** Roles that may SEE documents of this type. Empty = no restriction. */
    visibleToRoleIds?: string[];
    twoSided?: boolean;
    /** Sheets of paper rather than a card — refused together with twoSided. */
    multiPage?: boolean;
    scanShape?: string;
    position?: number;
    /**
     * The signing route: an ordered list of {role}, or null for one signature.
     *
     * ⚠️ This was missing here while `updateType` accepted it, so a type created
     * WITH a signing route was created without one — silently, since every other
     * field saved. The only way to get a route onto a new type was to create it,
     * reopen it, and set the route a second time.
     */
    signerRoute?: unknown;
  }) {
    assertCanManageTypes(data.actor);

    const key = normaliseKey(data.key);
    if (!key) throw new BadRequestException('A document type needs a key');

    this.assertPageShape(data.twoSided, data.multiPage);

    /*
      Validated by the SAME rule as an edit. Two definitions of a legal route is
      one place for them to disagree — and the direction they would disagree in
      is a type created with a chain the editor then refuses to save.
    */
    if (data.signerRoute !== undefined && data.signerRoute !== null) {
      const problem = routeProblem(data.signerRoute);
      if (problem) throw new BadRequestException(problem);
    }

    // Naming who may SEE a type is the same decision as naming who may see one
    // document, so it asks the same permission — a template editor must not be
    // able to hand the payslip register to a role of their choosing.
    if (data.visibleToRoleIds && data.visibleToRoleIds.length > 0) {
      assertCanManageVisibility(data.actor);
    }
    await this.assertTypeRefsInOrg(data.actor.organizationId, data);

    try {
      return await this.prisma.documentType.create({
        data: {
          organizationId: data.actor.organizationId,
          key,
          label: data.label.trim(),
          description: data.description?.trim() || null,
          cadence: data.cadence ?? 'ONE_OFF',
          direction: data.direction ?? 'ISSUED',
          retentionMonths: data.retentionMonths ?? null,
          signatureMode: data.signatureMode ?? 'NONE',
          isCredential: data.isCredential ?? false,
          // A credential without an expiry is legitimate — some qualifications
          // do not lapse — so this is not forced, only defaulted.
          hasExpiry: data.hasExpiry ?? (data.isCredential ?? false),
          requiredForWorkflowIds: data.requiredForWorkflowIds ?? [],
          // Nothing is expected of anybody unless it is said explicitly. Every
          // SUPPLIED type that exists today means "we accept this if you send
          // it", and upgrading must not put a red flag on every member.
          requiredFromAll: data.requiredFromAll ?? false,
          requiredFromRoleIds: data.requiredFromRoleIds ?? [],
          // Empty = no restriction, which is what every existing type is.
          visibleToRoleIds: data.visibleToRoleIds ?? [],
          twoSided: data.twoSided ?? false,
          multiPage: data.multiPage ?? false,
          scanShape: data.scanShape ?? 'CARD',
          position: data.position ?? 0,
          // null, not [] — null is "no route, one signature"; an empty array is
          // a type somebody misconfigured, and the reader tells them apart.
          signerRoute: (data.signerRoute ?? null) as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(`A document type with the key "${key}" already exists`);
      }
      throw err;
    }
  }

  async updateType(data: {
    actor: DocumentActor;
    id: string;
    patch: Partial<{
      label: string;
      description: string | null;
      retentionMonths: number | null;
      signatureMode: SignatureMode;
      isCredential: boolean;
      hasExpiry: boolean;
      requiredForWorkflowIds: string[];
      requiredFromAll: boolean;
      requiredFromRoleIds: string[];
      /** Roles that may SEE documents of this type. Empty = no restriction. */
      visibleToRoleIds: string[];
      twoSided: boolean;
      /** Sheets of paper rather than a card — refused together with twoSided. */
      multiPage: boolean;
      scanShape: string;
      isActive: boolean;
      position: number;
      /** Ordered signer roles, or null to go back to a single signature. */
      signerRoute: unknown;
    }>;
  }) {
    assertCanManageTypes(data.actor);
    const existing = await this.lookup.findTypeOr404(data.id, data.actor.organizationId);

    // Checked against what the type WILL be, not only what the edit names —
    // turning on multiPage alone, for a type already two-sided, is the same
    // misconfiguration arrived at in two steps.
    this.assertPageShape(
      data.patch.twoSided ?? existing.twoSided,
      data.patch.multiPage ?? (existing as { multiPage?: boolean }).multiPage,
    );

    /*
      A route is validated here rather than trusted.

      It is JSON on a column, so nothing else stops a malformed one being
      stored — and a document type whose route cannot be parsed would issue
      documents with no chain while appearing to have one, which is the worst
      of both. routeProblem returns the reason so the message is written once.
    */
    if (data.patch.signerRoute !== undefined) {
      const problem = routeProblem(data.patch.signerRoute);
      if (problem) throw new BadRequestException(problem);

    }

    // A form sends every field, so only a list that actually DIFFERS from the
    // stored one is a change of who may see the type.
    if (
      data.patch.visibleToRoleIds !== undefined &&
      !sameIdSet(data.patch.visibleToRoleIds, existing.visibleToRoleIds ?? [])
    ) {
      assertCanManageVisibility(data.actor);
    }
    await this.assertTypeRefsInOrg(data.actor.organizationId, data.patch);

    // `cadence` and `direction` are absent from the patch on purpose. Changing
    // either would re-interpret every document already filed under the type —
    // a MONTHLY type turned ONE_OFF orphans twelve rows a year from their
    // period, and flipping direction would hand members a delete button for
    // payslips. Make a new type instead.
    return this.prisma.documentType.update({
      where: { id: existing.id },
      data: data.patch as Prisma.DocumentTypeUpdateInput,
    });
  }

  /**
   * Retire a type. Never a hard delete: the documents filed under it must stay
   * readable, and the FK is RESTRICT precisely so this cannot be got around.
   */
  async deactivateType(data: { actor: DocumentActor; id: string }) {
    assertCanManageTypes(data.actor);
    const existing = await this.lookup.findTypeOr404(data.id, data.actor.organizationId);
    return this.prisma.documentType.update({
      where: { id: existing.id },
      data: { isActive: false },
    });
  }

  /**
   * Every role and workflow a type names must be this organization's own.
   *
   * ⚠️ Without it a type could carry another tenant's role id — harmless to
   * read, but a list nobody here can edit and an id that leaks across tenants.
   */
  private async assertTypeRefsInOrg(
    organizationId: string,
    refs: {
      visibleToRoleIds?: string[];
      requiredFromRoleIds?: string[];
      requiredForWorkflowIds?: string[];
    },
  ) {
    const roleIds = [
      ...new Set([...(refs.visibleToRoleIds ?? []), ...(refs.requiredFromRoleIds ?? [])]),
    ];
    if (roleIds.length > 0) {
      const found = await this.prisma.accessRole.count({
        where: { id: { in: roleIds }, organizationId },
      });
      if (found !== roleIds.length) {
        throw new BadRequestException('A role on this document type is not in your organization');
      }
    }
    const workflowIds = [...new Set(refs.requiredForWorkflowIds ?? [])];
    if (workflowIds.length > 0) {
      const found = await this.prisma.statusWorkflow.count({
        where: { id: { in: workflowIds }, organizationId },
      });
      if (found !== workflowIds.length) {
        throw new BadRequestException(
          'A workflow on this document type is not in your organization',
        );
      }
    }
  }
}
