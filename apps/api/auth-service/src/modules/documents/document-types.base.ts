import { BadRequestException, Injectable } from '@nestjs/common';
import { SHARED_ROLE_WHERE, countWorkflowsInOrg } from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { DocumentLookupService } from './document-lookup.service';

/**
 * What creating and editing a document type share: the page shape it asks for, and
 * its references kept inside the organization.
 */
@Injectable()
export abstract class DocumentTypesBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly lookup: DocumentLookupService,
  ) {}

  /**
   * A card has a reverse; a stack of paper has a page 2.
   *
   * ⚠️ Refused rather than silently coerced. Both set is somebody misreading
   * the editor, and quietly picking a winner means the type behaves one way
   * while its settings screen says another — which is only discovered by a
   * member whose upload asks for the wrong thing.
   */
  protected assertPageShape(twoSided?: boolean | null, multiPage?: boolean | null) {
    if (twoSided && multiPage) {
      throw new BadRequestException('A document type is either two-sided or many sheets, not both');
    }
  }

  /**
   * Every role and workflow a type names must be this organization's own.
   *
   * ⚠️ Without it a type could carry another tenant's role id — harmless to
   * read, but a list nobody here can edit and an id that leaks across tenants.
   */
  protected async assertTypeRefsInOrg(
    organizationId: string,
    refs: {
      visibleToRoleIds?: string[];
      requiredFromRoleIds?: string[];
      requiredForWorkflowIds?: string[];
    },
  ) {
    const roleIds = [...new Set([...(refs.visibleToRoleIds ?? []), ...(refs.requiredFromRoleIds ?? [])])];
    if (roleIds.length > 0) {
      // A personal role names one person in one workspace — not a group a document type can address.
      const found = await this.prisma.accessRole.count({
        where: { id: { in: roleIds }, organizationId, ...SHARED_ROLE_WHERE },
      });
      if (found !== roleIds.length) {
        throw new BadRequestException('A role on this document type is not in your organization');
      }
    }
    const workflowIds = [...new Set(refs.requiredForWorkflowIds ?? [])];
    if (workflowIds.length > 0) {
      const found = await countWorkflowsInOrg(this.prisma, workflowIds, organizationId);
      if (found !== workflowIds.length) {
        throw new BadRequestException('A workflow on this document type is not in your organization');
      }
    }
  }
}
