import { Injectable, ForbiddenException } from '@nestjs/common';
import { assertSpaceInOrg, assertUserInOrg } from '../../common/tenant-scope.util';
import {
  success,
  resolveRate,
  permissionsExceed,
  permissionsFromOrgRole,
  externalForbiddenIn,
  permissionLabel,
  effectiveBillBy,
  utcTodayKey,
  type PermissionSet,
  type BillByValue,
  effectiveHoursBasis,
  peopleCostRates,
  orgRates,
} from '@hbcfield/shared';
import { userSelect, roleSelect, SpaceMemberAuthority, authorityRefusal, comboRefusal } from './space-roles-helpers';
import { SpaceRolesBase } from './space-roles.base';

/** A workspace's members: the list, and adding somebody. */
@Injectable()
export class SpaceMembersService extends SpaceRolesBase {
  // ── Members (SpaceAssignment) ───────────────────────────────────────────────

  async listMembers(data: { organizationId: string; spaceId: string }) {
    await assertSpaceInOrg(this.prisma, data.spaceId, data.organizationId);
    const members = await this.prisma.spaceAssignment.findMany({
      where: { organizationId: data.organizationId, spaceId: data.spaceId },
      include: {
        user: userSelect,
        role: roleSelect,
        workRole: roleSelect,
      },
      orderBy: { createdAt: 'asc' },
    });

    /*
      What each member's rate WOULD be if this assignment stayed blank.

      ⚠️ Resolved HERE and sent down, rather than worked out in the browser. The
      order of the four levels is written down exactly once, in `resolveRate` —
      a second copy in a screen is a second answer to "why is this €40", and the
      first person to find them disagreeing is looking at an invoice.

      Two queries for the whole list, not one per row.
    */
    const [space, org, users] = await Promise.all([
      this.prisma.companyLocation.findUnique({
        where: { id: data.spaceId },
        select: { billableRateCents: true, costRateCents: true },
      }),
      orgRates(this.prisma, data.organizationId),
      peopleCostRates(
        this.prisma,
        members.map((m) => m.userId),
      ),
    ]);
    const byUser = new Map(users.map((u) => [u.id, u]));
    // Each person's day cost today, from the dated history on their profile — one query.
    const today = utcTodayKey();
    const dayRows = await this.prisma.rateHistory.findMany({
      where: {
        organizationId: data.organizationId,
        target: 'MEMBER',
        kind: 'COST_DAY',
        targetId: { in: members.map((m) => m.userId) },
        effectiveFrom: { lte: new Date(`${today}T00:00:00Z`) },
      },
      orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }],
      select: { targetId: true, cents: true },
    });
    const dayCostByUser = new Map<string, number | null>();
    for (const r of dayRows) dayCostByUser.set(r.targetId, r.cents);

    // Shape to match the old response (spaceRole → role, + routing arrays).
    return success(
      members.map((m) => ({
        id: m.id,
        userId: m.userId,
        spaceId: m.spaceId,
        user: m.user,
        spaceRole: m.role,
        /** The trade here — grants nothing, decides billing. */
        workRole: m.workRole,
        allowSecondRole: m.allowSecondRole,
        /** How this member is billed here; null = by the hour. */
        billBy: m.billBy,
        effectiveBillBy: effectiveBillBy(m.billBy as BillByValue | null),
        /** Which hours go on the client's invoice; null = counted. */
        hoursBasis: m.hoursBasis,
        effectiveHoursBasis: effectiveHoursBasis(m.hoursBasis),
        billRateCents: m.billRateCents,
        /*
          What this person costs you — from their PROFILE (or the organization
          default), the only place a cost lives. Shown read-only here; stripped
          by the gateway for anybody without labour cost.
        */
        profileCostRateCents: resolveRate('cost', {
          member: byUser.get(m.userId) ?? null,
          organization: org ? { costRateCents: org.costRateCents } : null,
        }).cents,
        profileCostDayCents: dayCostByUser.get(m.userId) ?? null,
        // What it falls back to — the workspace, else the organization.
        inheritedBillRateCents: resolveRate('bill', {
          client: space ? { billRateCents: space.billableRateCents, costRateCents: space.costRateCents } : null,
          organization: org ? { billRateCents: org.billableRateCents, costRateCents: org.costRateCents } : null,
        }).cents,
        notifyRoleIds: m.notifyRoleIds,
        notifyUserIds: m.notifyUserIds,
        contactRoleIds: m.contactRoleIds,
        contactUserIds: m.contactUserIds,
        approveRoleIds: m.approveRoleIds,
        approveUserIds: m.approveUserIds,
      })),
    );
  }

  /** Assign (or re-assign) a member to a space with a space role. Idempotent. */
  async assignMember(data: {
    organizationId: string;
    spaceId: string;
    userId: string;
    spaceRoleId?: string | null; // AccessRole (space) id — name kept for API compat
    createdById?: string;
    /**
     * What the caller holds in this space — the ceiling on what they may hand
     * out. Undefined/null means no ceiling and is set ONLY for an admin, who
     * holds every permission and could never trip it.
     */
    requesterPerms?: PermissionSet | null;
    /** What the caller may change here (see SpaceMemberAuthority). Absent = everything. */
    authority?: SpaceMemberAuthority;
    /**
     * The caller acts through a grant in THIS workspace only: they may not
     * re-shape somebody who already holds more here than they do.
     */
    outrankCheck?: boolean;
  }) {
    await assertSpaceInOrg(this.prisma, data.spaceId, data.organizationId, { activeOnly: true });
    const target = await assertUserInOrg(this.prisma, data.userId, data.organizationId);
    const may: SpaceMemberAuthority = data.authority ?? { addMembers: true, grantRoles: true, manageTerms: true };
    const existing = await this.prisma.spaceAssignment.findUnique({
      where: { userId_spaceId: { userId: data.userId, spaceId: data.spaceId } },
      select: {
        id: true,
        roleId: true,
        workRoleId: true,
        allowSecondRole: true,
        role: { select: { permissions: true } },
      },
    });
    /*
      Adding somebody to the workspace and choosing what they may do there are
      two different trusts now (canAddSpaceMembers / canGrantSpaceRoles), so a
      person may hold one without the other. Putting a NEW person in needs the
      first; whatever role comes with them needs the second as well.
    */
    if (!existing && !may.addMembers) throw authorityRefusal('add people');
    /*
      ONE role picker, two columns: a trade lands in `workRoleId` (grants
      nothing), anything else in `roleId` (permissions). Re-assigning a member
      replaces the role in that slot and leaves the other slot alone — subject
      to the two-role rule.
    */
    if (data.spaceRoleId) {
      // Only a shared role, or this very assignment's own personal role — never somebody else's.
      const picked = await this.getOwnedRole(data.organizationId, data.spaceRoleId, {
        assignmentId: existing?.id ?? null,
      });
      if (picked.kind === 'WORK') {
        // A trade carries the billing terms: canManageUsers here, never an external member.
        if (!may.manageTerms) throw authorityRefusal('give people a trade');
        if (target.isExternal) throw comboRefusal('EXTERNAL_NO_WORK_ROLE');
        if (existing?.roleId && !existing.allowSecondRole) throw comboRefusal('SECOND_ROLE_NOT_ALLOWED');
        const member = await this.prisma.spaceAssignment.upsert({
          where: { userId_spaceId: { userId: data.userId, spaceId: data.spaceId } },
          create: {
            organizationId: data.organizationId,
            spaceId: data.spaceId,
            userId: data.userId,
            workRoleId: picked.id,
            createdById: data.createdById,
          },
          update: { workRoleId: picked.id },
          include: { user: userSelect, role: roleSelect, workRole: roleSelect },
        });
        await this.useWorkRoleIn(this.prisma, data.spaceId, picked.id);
        return success(
          {
            id: member.id,
            userId: member.userId,
            user: member.user,
            spaceRole: member.role,
            workRole: member.workRole,
          },
          'Member assigned',
        );
      }
    }
    const changesRole = (data.spaceRoleId ?? null) !== (existing?.roleId ?? null);
    if (changesRole && (data.spaceRoleId || existing?.roleId) && !may.grantRoles) throw authorityRefusal('give roles');
    if (
      changesRole &&
      data.outrankCheck &&
      data.requesterPerms &&
      existing?.role &&
      permissionsExceed(data.requesterPerms, permissionsFromOrgRole(existing.role.permissions))
    ) {
      throw new ForbiddenException({
        message: 'This person holds more in this workspace than you do',
        code: 'MEMBER_ABOVE_YOU',
      });
    }
    if (data.spaceRoleId) {
      const role = await this.getOwnedRole(data.organizationId, data.spaceRoleId, {
        assignmentId: existing?.id ?? null,
      });
      /*
        An external member may hold only what the allow-list permits.

        This is the ONE place a space role becomes real authority, so it is the
        place the ceiling belongs — a check in the gateway would have to read
        the role again and the two copies would be free to disagree. The
        allow-list is shared with the UI, which greys the same permissions out;
        this is what makes the greying true rather than decorative.
      */
      if (target.isExternal) {
        const forbidden = externalForbiddenIn(permissionsFromOrgRole(role.permissions));
        if (forbidden.length) {
          throw new ForbiddenException(
            `This role cannot be given to an external member — it grants ${forbidden
              .map((k) => permissionLabel(k))
              .join(', ')}`,
          );
        }
      }
      /*
        Nobody may grant what they do not hold.

        Checked here rather than at the gateway because this is where the role's
        permissions are read — a gateway-side check would have to fetch the role
        a second time, and the two copies would be free to disagree.

        This barely mattered while a space role carried four attendance
        permissions: the worst a space manager could do was make somebody an
        approver of overtime. A space role can now carry sixteen, including
        managing this space's members, deleting assets, the CRM client grants
        and location tracking — so handing one out is a real transfer of
        authority and needs the ceiling the org paths have always had.
      */
      if (data.requesterPerms && permissionsExceed(data.requesterPerms, permissionsFromOrgRole(role.permissions))) {
        throw new ForbiddenException('You cannot grant permissions beyond your own');
      }
      if (existing?.workRoleId && !existing.allowSecondRole) throw comboRefusal('SECOND_ROLE_NOT_ALLOWED');
    }

    const member = await this.prisma.spaceAssignment.upsert({
      where: { userId_spaceId: { userId: data.userId, spaceId: data.spaceId } },
      create: {
        organizationId: data.organizationId,
        spaceId: data.spaceId,
        userId: data.userId,
        roleId: data.spaceRoleId ?? null,
        createdById: data.createdById,
      },
      update: { roleId: data.spaceRoleId ?? null },
      include: { user: userSelect, role: roleSelect, workRole: roleSelect },
    });
    await this.dropStalePersonalRole(member.id, member.roleId ?? null);
    return success(
      { id: member.id, userId: member.userId, user: member.user, spaceRole: member.role, workRole: member.workRole },
      'Member assigned',
    );
  }
}
