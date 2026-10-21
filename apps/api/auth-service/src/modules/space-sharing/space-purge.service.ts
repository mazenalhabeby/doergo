import { Injectable, HttpStatus } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';

/**
 * A workspace removed for good: what auth-service owns for it goes too (docs/data-ownership.md, group B).
 * task-service used to delete these rows itself inside its purge.
 */
@Injectable()
export class SpacePurgeService {
  constructor(private readonly prisma: PrismaService) {}

  async purgeForSpace(data: { organizationId: string; spaceId: string }) {
    const { organizationId, spaceId } = data;
    // An ACTIVE share is another organization's access — the owner unshares deliberately first (audit S-B2).
    const active = await this.prisma.spaceShare.count({
      where: { spaceId, ownerOrgId: organizationId, status: 'ACTIVE' },
    });
    if (active > 0)
      return {
        success: false as const,
        statusCode: HttpStatus.BAD_REQUEST,
        message: `${active} organization(s) this space is shared with — unshare first`,
      };
    const [categories, shares] = await this.prisma.$transaction([
      this.prisma.intakeCategory.deleteMany({ where: { spaceId, organizationId } }),
      // SpaceShare.spaceId has no foreign key: PENDING/REVOKED history would dangle forever.
      this.prisma.spaceShare.deleteMany({ where: { spaceId, ownerOrgId: organizationId } }),
    ]);
    return { success: true as const, data: { categoriesRemoved: categories.count, sharesRemoved: shares.count } };
  }
}
