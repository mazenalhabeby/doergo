import { personName, parseAssignedHome, Role } from '@hbcfield/shared';
import { Injectable, Logger, NotFoundException, BadRequestException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Who owns the organization (handing it over), and a member's home workspace. */
@Injectable()
export class MemberOwnershipService {
  private readonly logger = new Logger(MemberOwnershipService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Hand the organization to somebody else.
   *
   * The only way an owner stops being the owner, which is what makes "the owner
   * cannot be removed" a rule rather than a trap.
   *
   * ONLY THE OWNER MAY DO THIS. Not any admin — otherwise the protection is
   * theatre: an admin who cannot delete the founder could simply take ownership
   * from them and then delete them. Ownership is the one thing in the product
   * that is not delegable by holding a permission.
   *
   * The new owner is made an ADMIN in the same transaction, because an owner who
   * cannot administer the organization is the lockout this whole feature exists
   * to prevent. The previous owner stays an admin — losing ownership is not a
   * demotion, and stripping their access as a side effect of a handover is the
   * kind of surprise that makes people avoid the button.
   */
  async transferOwnership(data: { organizationId: string; requesterId: string; newOwnerId: string }) {
    const refuse = (statusCode: number, message: string) => ({ success: false as const, statusCode, message });

    const org = await this.prisma.organization.findUnique({
      where: { id: data.organizationId },
      select: { ownerId: true },
    });
    if (!org) return refuse(HttpStatus.NOT_FOUND, 'Organization not found');

    /*
      An organization with no owner recorded yet — possible only for one created
      before ownership existed and never backfilled — is claimable by an admin, so
      it cannot become permanently ownerless. Once owned, only the owner moves it.
    */
    if (org.ownerId && org.ownerId !== data.requesterId) {
      return refuse(HttpStatus.FORBIDDEN, 'Only the organization owner can transfer ownership.');
    }
    if (org.ownerId === data.newOwnerId) {
      return refuse(HttpStatus.BAD_REQUEST, 'That member already owns this organization.');
    }

    const target = await this.prisma.user.findFirst({
      where: { id: data.newOwnerId, organizationId: data.organizationId, isActive: true },
      select: { id: true, role: true, firstName: true, lastName: true, isExternal: true },
    });
    // Scoped to the organization: an id from another tenant must read as "not a
    // member here", never as a transfer.
    if (!target) return refuse(HttpStatus.NOT_FOUND, 'That member is not part of this organization.');

    /*
      Never to somebody who works for a client or partner.

      This transfer PROMOTES its target to ADMIN, so handing it to an external
      member would make a client's supervisor an admin and the owner of the
      organization in one step — the whole tenant, from a row menu. There is no
      legitimate case for it, so it is refused outright rather than warned about.
    */
    if (target.isExternal) {
      return refuse(
        HttpStatus.BAD_REQUEST,
        'Ownership cannot be transferred to an external member — they work for another company.',
      );
    }

    /*
      The new owner must ALREADY be an admin.

      Ownership used to promote whoever received it, which meant one click on a
      row menu turned any member into an admin — a privilege escalation that
      nobody explicitly approved and that no audit line describes as one. Making
      somebody an admin and handing them the organization are two decisions, and
      an owner should have to take them one at a time.

      The role write below stays: an admin who is already an admin is unchanged
      by it, and it keeps the invariant true if the two ever drift.
    */
    if (target.role !== Role.ADMIN) {
      return refuse(
        HttpStatus.BAD_REQUEST,
        'Ownership can only be transferred to an admin. Make them an admin first, then transfer.',
      );
    }

    if (!org.ownerId) {
      const requester = await this.prisma.user.findFirst({
        where: { id: data.requesterId, organizationId: data.organizationId, role: Role.ADMIN, isActive: true },
        select: { id: true },
      });
      if (!requester) return refuse(HttpStatus.FORBIDDEN, 'Only an admin can claim an unowned organization.');
    }

    /*
      Both writes or neither. An owner recorded against somebody who is not an
      admin is exactly the broken state this guards against, and a half-applied
      transfer is how you get there.
    */
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: target.id }, data: { role: Role.ADMIN } }),
      this.prisma.organization.update({ where: { id: data.organizationId }, data: { ownerId: target.id } }),
    ]);

    this.logger.warn(`[OWNERSHIP] org ${data.organizationId} transferred to ${target.id} by ${data.requesterId}`);

    return {
      success: true,
      data: { ownerId: target.id, ownerName: personName(target) },
      message: 'Ownership transferred',
    };
  }

  /**
   * Set up a member's phone home screen from the office (or clear it: null).
   *
   * The phone applies each assignment once and then leaves the member free to
   * change it. Validated here against the shared definition, scoped to the
   * caller's organization, and never for a portal customer (they have no app
   * home). Entitlement is still decided by the phone at render time, so an
   * assignment cannot show anybody something they may not open.
   */
  async setAssignedHome(data: { memberId: string; organizationId: string; layout: unknown }) {
    const member = await this.prisma.user.findFirst({
      where: { id: data.memberId, organizationId: data.organizationId, role: { not: 'CUSTOMER' as const } },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('Member not found');

    let value: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
    if (data.layout !== null && data.layout !== undefined) {
      try {
        value = parseAssignedHome(data.layout) as unknown as Prisma.InputJsonValue;
      } catch (err) {
        throw new BadRequestException((err as Error).message);
      }
    }
    await this.prisma.user.update({ where: { id: member.id }, data: { assignedHome: value } });
    return { success: true, data: value === Prisma.DbNull ? null : value };
  }
}
