import { BadRequestException, Injectable } from '@nestjs/common';
import { visibleTypeSelfWhere, routeProblem } from '@hbcfield/shared';
import { Prisma } from '@prisma/client';
import {
  type DocumentActor,
  assertCanManageTypes,
  assertCanManageVisibility,
  normaliseKey,
} from '../core/document-common';
import { PrismaService } from '@hbcfield/shared';
import { DocumentLookupService } from '../core/document-lookup.service';
import { assertPageShape, assertTypeRefsInOrg } from './document-type-rules';
import { type documentsCreateType, type RpcRequest } from '@hbcfield/shared/microservices';

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
          : (visibleTypeSelfWhere({
              roleId: data.roleId ?? null,
              isAdmin: !!data.isAdmin,
              userId: data.userId ?? null,
            }) ?? {})),
        organizationId: data.organizationId,
        ...(data.includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ position: 'asc' }, { label: 'asc' }],
    });
  }

  // The request is the message contract's (shared with the gateway) — one definition, not two.
  async createType(data: RpcRequest<typeof documentsCreateType>) {
    assertCanManageTypes(data.actor);

    const key = normaliseKey(data.key);
    if (!key) throw new BadRequestException('A document type needs a key');

    assertPageShape(data.twoSided, data.multiPage);

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
    await assertTypeRefsInOrg(this.prisma, data.actor.organizationId, data);

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
          hasExpiry: data.hasExpiry ?? data.isCredential ?? false,
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
}
