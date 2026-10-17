import { BadRequestException, Injectable } from '@nestjs/common';
import { routeProblem } from '@hbcfield/shared';
import { Prisma } from '@prisma/client';
import { assertCanManageTypes, assertCanManageVisibility, sameIdSet } from './document-common';
import { DocumentTypesBase } from './document-types.base';
import { type documentsUpdateType, type RpcRequest } from '@hbcfield/shared/microservices';

/** Editing a document type: its fields, its route, who sees it. */
@Injectable()
export class DocumentTypeUpdateService extends DocumentTypesBase {
  // The request is the message contract's (shared with the gateway) — one definition, not two.
  async updateType(data: RpcRequest<typeof documentsUpdateType>) {
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
}
