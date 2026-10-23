import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService, workspaceInOrg, usableLegalEntityId, COMPANY_UNKNOWN_MESSAGE } from '@hbcfield/shared';
import { keepOrgUserIds } from '../../common/records/org-user-ids';
import { CustomerInput } from './customers-helpers';

/**
 * What a client write names must be this organization's own: its workspace and
 * portal, its company, and the members it is handed to.
 */
@Injectable()
export class CustomerRefsService {
  constructor(private readonly prisma: PrismaService) {}

  /** A client's company: one of this organization's active companies, or null. Anything else is refused. */
  async clientCompany(organizationId: string, value: unknown): Promise<string | null | undefined> {
    const r = await usableLegalEntityId(this.prisma, organizationId, value);
    if (!r.ok) throw new BadRequestException({ message: COMPANY_UNKNOWN_MESSAGE, code: 'COMPANY_UNKNOWN' });
    return r.id;
  }

  /** Keep only ids that are real users in THIS org — the shared helper, uncapped. */
  keepOrgUserIds(ids: string[], organizationId: string): Promise<string[]> {
    return keepOrgUserIds(this.prisma, ids, organizationId);
  }

  /** A customer's spaceId/portalId MUST belong to the same org — otherwise a
   *  staff user could point their customer at another org's space or portal
   *  (portal-config leak to their own app users). Validated on every write.
   *
   *  ⚠️ The space must also be LIVE. An archived one passed, which put the client
   *  in a list nobody opens — invisible everywhere, and reachable only by
   *  restoring a workspace whose connection to the missing client nothing
   *  states. */
  async assertRefsInOrg(dto: CustomerInput, organizationId: string) {
    if (dto.spaceId) {
      const s = await workspaceInOrg(this.prisma, dto.spaceId, organizationId, { activeOnly: true });
      if (!s) throw new BadRequestException('Invalid space for this organization');
    }
    if (dto.portalId) {
      const p = await this.prisma.portal.findFirst({
        where: { id: dto.portalId, organizationId },
        select: { id: true },
      });
      if (!p) throw new BadRequestException('Invalid portal for this organization');
    }
  }
}
