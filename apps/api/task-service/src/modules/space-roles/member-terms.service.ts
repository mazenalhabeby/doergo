import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { success, writeRateChange, utcTodayKey, COST_ON_PROFILE_MESSAGE, toISODateString } from '@hbcfield/shared';
import { withRateErrors } from './space-roles-helpers';
import { SpaceRolesBase } from './space-roles.base';

/** A member's terms in one workspace: their rate and its history, and who is told about them. */
@Injectable()
export class MemberTermsService extends SpaceRolesBase {
  /** Set the per-member, per-space routing override. Whitelists ids to arrays. */
  /**
   * What this member is billed at, AT THIS CLIENT — the top rung of the ladder.
   *
   * ⚠️ This is where a customer-facing rate belongs. What somebody COSTS is a
   * fact about the person and follows them everywhere; what a client PAYS for
   * their hour is a fact about that client, and the same engineer is routinely
   * worth €45 at one customer and €60 at another. One field on the person
   * cannot express that, and forking the person's record per customer is worse.
   *
   * ⚠️ Undefined leaves the column alone; null clears it back to "inherit the
   * member's rate, then the client's, then the organisation's". Collapsing them
   * makes every save wipe a rate somebody set elsewhere.
   */
  async updateMemberRate(data: {
    organizationId: string;
    spaceId: string;
    memberId: string;
    billRateCents?: number | null;
    costRateCents?: number | null;
    /** What a DAY of this member costs you here. History only. */
    costDayCents?: number | null;
    /** The first day the new rate applies, `YYYY-MM-DD`. Default today. */
    effectiveFrom?: string;
    createdById?: string;
  }) {
    const member = await this.prisma.spaceAssignment.findFirst({
      where: { id: data.memberId, organizationId: data.organizationId, spaceId: data.spaceId },
      include: { user: { select: { isExternal: true } } },
    });
    if (!member) throw new NotFoundException('Space member not found');

    /*
      ⚠️ AN EXTERNAL MEMBER HAS NO RATE, and the server says so rather than
      trusting the screen to have hidden the field.

      They work for a client or a partner, not for us: we neither pay them nor
      bill their hours, so the number would mean nothing — and a stored one
      would quietly feed the ladder and land on an invoice. A list must not be
      looser than the check behind it.
    */
    if (member.user?.isExternal) {
      throw new BadRequestException('An external member has no billing rate — they do not work for you');
    }

    if (data.billRateCents === undefined && data.costRateCents === undefined && data.costDayCents === undefined) {
      return success(member);
    }
    // What a person costs lives on their profile (rate-ladder LEVELS_BY_KIND), never per workspace.
    if (data.costRateCents !== undefined || data.costDayCents !== undefined) {
      throw new BadRequestException(COST_ON_PROFILE_MESSAGE);
    }

    /*
      ⚠️ Through the ONE rate writer: a dated history row, then the column set to
      whatever is in force today. Writing the column alone is how a raise
      re-priced every un-invoiced day before it.
    */
    const updated = await withRateErrors(() =>
      this.prisma.$transaction(async (tx) => {
        const patch: Record<string, number | null> = {};
        const write = (kind: 'BILL_HOUR' | 'COST_HOUR' | 'COST_DAY', cents: number | null | undefined) =>
          writeRateChange(tx, {
            organizationId: data.organizationId,
            target: 'ASSIGNMENT',
            targetId: member.id,
            kind,
            cents,
            effectiveFrom: data.effectiveFrom,
            createdById: data.createdById ?? null,
          });
        if (data.billRateCents !== undefined)
          patch.billRateCents = (await write('BILL_HOUR', data.billRateCents)).nowCents;
        if (data.costRateCents !== undefined)
          patch.costRateCents = (await write('COST_HOUR', data.costRateCents)).nowCents;
        if (data.costDayCents !== undefined) await write('COST_DAY', data.costDayCents);
        return tx.spaceAssignment.update({
          where: { id: member.id },
          data: patch,
          select: { id: true, billRateCents: true, costRateCents: true },
        });
      }),
    );
    return success(updated);
  }

  /**
   * The dated history of one rate, oldest first — what a "rate history" panel
   * lists. The gateway has already decided the caller may read this record;
   * here the record is checked to belong to the organization (and an
   * assignment to the workspace named), so an id from elsewhere reads nothing.
   */
  async listRateHistory(data: {
    organizationId: string;
    target: 'ORGANIZATION' | 'SPACE' | 'MEMBER' | 'ASSIGNMENT';
    targetId: string;
    kinds: Array<'BILL_HOUR' | 'COST_HOUR' | 'COST_DAY'>;
    spaceId?: string;
  }) {
    const owned =
      data.target === 'ORGANIZATION'
        ? data.targetId === data.organizationId
        : data.target === 'SPACE'
          ? !!(await this.prisma.companyLocation.findFirst({
              where: { id: data.targetId, organizationId: data.organizationId },
              select: { id: true },
            }))
          : data.target === 'MEMBER'
            ? !!(await this.prisma.user.findFirst({
                where: { id: data.targetId, organizationId: data.organizationId },
                select: { id: true },
              }))
            : !!(await this.prisma.spaceAssignment.findFirst({
                where: {
                  id: data.targetId,
                  organizationId: data.organizationId,
                  ...(data.spaceId ? { spaceId: data.spaceId } : {}),
                },
                select: { id: true },
              }));
    if (!owned) throw new NotFoundException('Not found');
    const rows = await this.prisma.rateHistory.findMany({
      where: {
        organizationId: data.organizationId,
        target: data.target,
        targetId: data.targetId,
        kind: { in: data.kinds },
        spaceId: null,
      },
      orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }],
      select: { kind: true, cents: true, effectiveFrom: true },
    });
    const today = utcTodayKey();
    return success(
      rows.map((r) => {
        const day = toISODateString(r.effectiveFrom);
        return { kind: r.kind, cents: r.cents, effectiveFrom: day, state: day > today ? 'scheduled' : 'past' };
      }),
    );
  }

  async updateMemberRouting(data: {
    organizationId: string;
    spaceId: string;
    memberId: string;
    notifyRoleIds?: string[];
    notifyUserIds?: string[];
    contactRoleIds?: string[];
    contactUserIds?: string[];
    approveRoleIds?: string[];
    approveUserIds?: string[];
  }) {
    const member = await this.prisma.spaceAssignment.findFirst({
      where: { id: data.memberId, organizationId: data.organizationId, spaceId: data.spaceId },
    });
    if (!member) throw new NotFoundException('Space member not found');
    const arr = (v?: string[]) =>
      Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : undefined;
    await this.assertRoutingInOrg(data.organizationId, {
      roleIds: [data.notifyRoleIds, data.contactRoleIds, data.approveRoleIds].flatMap((v) => arr(v) ?? []),
      userIds: [data.notifyUserIds, data.contactUserIds, data.approveUserIds].flatMap((v) => arr(v) ?? []),
    });
    const updated = await this.prisma.spaceAssignment.update({
      where: { id: member.id },
      data: {
        notifyRoleIds: arr(data.notifyRoleIds),
        notifyUserIds: arr(data.notifyUserIds),
        contactRoleIds: arr(data.contactRoleIds),
        contactUserIds: arr(data.contactUserIds),
        approveRoleIds: arr(data.approveRoleIds),
        approveUserIds: arr(data.approveUserIds),
      },
      select: {
        id: true,
        notifyRoleIds: true,
        notifyUserIds: true,
        contactRoleIds: true,
        contactUserIds: true,
        approveRoleIds: true,
        approveUserIds: true,
      },
    });
    return success(updated, 'Routing updated');
  }
}
