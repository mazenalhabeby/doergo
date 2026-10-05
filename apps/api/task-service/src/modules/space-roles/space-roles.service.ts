import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  success,
  resolveRate,
  BUILTIN_ROLES,
  ACCESS_PERMISSION_SCHEMA,
  permissionsExceed,
  permissionsFromOrgRole,
  externalForbiddenIn,
  permissionLabel,
  isRoleKind,
  isBillBy,
  permissionsForKind,
  roleComboProblem,
  ROLE_COMBO_MESSAGES,
  effectiveBillBy,
  writeRateChange,
  loadRateBook,
  utcTodayKey,
  RateChangeError,
  type PermissionSet,
  type BillByValue,
  type RoleKindValue,
  effectiveHoursBasis,
  isHoursBasis,
  type HoursBasis,
  COST_ON_PROFILE_MESSAGE
} from '@hbcfield/shared';

// Permission keys that make sense on a SPACE role.
const SPACE_PERMISSION_KEYS = ACCESS_PERMISSION_SCHEMA
  .filter((p) => p.scopes.includes('space'))
  .map((p) => p.key);

// `position` is the free-form job title an admin typed — "IT Engineering",
// "Sales", "CEO". The member lists show it under the name, and a list that
// displays a field should carry it rather than have the browser join it back
// on from somewhere else.
const userSelect = {
  /*
    ⚠️ `isExternal` is here so the screen can tell the two apart. An external
    member works for a client or a partner, not for us — we neither pay them nor
    bill their hours, so a rate is meaningless on them, and the roster must be
    able to say so without a second request per row.
  */
  select: {
    id: true, firstName: true, lastName: true, email: true,
    avatarUrl: true, position: true, isExternal: true,
  },
};
const roleSelect = { select: { id: true, name: true, slug: true, color: true, permissions: true, kind: true } };

/** A refusal the screens can translate, with the rule's own sentence as the fallback. */
function comboRefusal(code: keyof typeof ROLE_COMBO_MESSAGES): BadRequestException {
  return new BadRequestException({ message: ROLE_COMBO_MESSAGES[code], code });
}

/** A rate change the shared rule refused, as a 400 rather than a 500. */
async function withRateErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof RateChangeError) throw new BadRequestException({ message: e.message, code: `RATE_START_${e.code}` });
    throw e;
  }
}

/**
 * Space roles + space membership on the UNIFIED model (AccessRole scope=SPACE +
 * SpaceAssignment). Replaces the legacy SpaceRole/SpaceMember stack. Also stores
 * the per-member, per-space routing override (who is notified about / who this
 * member may contact within the space).
 *
 * Org-scoped: organizationId always from the caller's token; spaceId/userId are
 * verified in-org before use. Delegation (space-manager) is enforced at the
 * gateway against the resource's own spaceId.
 */
@Injectable()
export class SpaceRolesService {
  private readonly logger = new Logger(SpaceRolesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Roles (AccessRole, scope SPACE) ────────────────────────────────────────

  async listRoles(data: { organizationId: string }) {
    await this.ensureBuiltInRoles(data.organizationId);
    const roles = await this.prisma.accessRole.findMany({
      where: { organizationId: data.organizationId, scope: { in: ['SPACE', 'BOTH'] } },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { spaceAssignments: true, workAssignments: true } } },
    });
    return success(
      roles.map(({ _count, ...r }) => ({ ...r, _count: { members: _count.spaceAssignments + _count.workAssignments } })),
    );
  }

  /**
   * The roles as ONE workspace sees them: who holds each here, and — for a work
   * role — its day rate here, now and as scheduled.
   *
   * Three queries for the whole screen (roles, this space's assignments, this
   * space's day-rate history), never one per role.
   */
  async listSpaceRoles(data: { organizationId: string; spaceId: string }) {
    await this.assertSpaceInOrg(data.organizationId, data.spaceId);
    await this.ensureBuiltInRoles(data.organizationId);
    const [roles, assignments] = await Promise.all([
      this.prisma.accessRole.findMany({
        where: { organizationId: data.organizationId, scope: { in: ['SPACE', 'BOTH'] } },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true, name: true, slug: true, color: true, description: true, permissions: true,
          kind: true, isSystem: true, isActive: true, scope: true,
          _count: { select: { spaceAssignments: true, workAssignments: true } },
        },
      }),
      this.prisma.spaceAssignment.findMany({
        where: { organizationId: data.organizationId, spaceId: data.spaceId },
        select: { roleId: true, workRoleId: true, user: userSelect },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const workRoleIds = roles.filter((r) => r.kind === 'WORK').map((r) => r.id);
    const book = await loadRateBook(this.prisma, data.organizationId, { roleIds: workRoleIds, roleSpaceId: data.spaceId });
    const today = utcTodayKey();

    return success(
      roles.map(({ _count, ...r }) => {
        const holders = assignments
          .filter((a) => (r.kind === 'WORK' ? a.workRoleId === r.id : a.roleId === r.id))
          .map((a) => a.user);
        const isWork = r.kind === 'WORK';
        const timeline = isWork ? book.timeline('ROLE', r.id, 'BILL_DAY', data.spaceId) : [];
        const defaults = isWork ? book.timeline('ROLE', r.id, 'BILL_DAY', null) : [];
        const asHistory = (rows: typeof timeline) =>
          rows.map((row) => ({ cents: row.cents, effectiveFrom: row.effectiveFrom, state: row.effectiveFrom > today ? 'scheduled' : 'past' }));
        return {
          ...r,
          holders,
          /** Holders across ALL workspaces — what decides whether the kind may still change. */
          inUseCount: _count.spaceAssignments + _count.workAssignments,
          /** What applies here today: this workspace's own rate, else the role's default. */
          dayRateCents: isWork ? book.dayRateOn(today, r.id, data.spaceId) : null,
          dayRateSource: isWork ? book.dayRateSourceOn(today, r.id, data.spaceId) : null,
          /** This workspace's own rates. */
          dayRateHistory: asHistory(timeline),
          /** The role's default for every workspace. */
          defaultDayRateCents: isWork ? book.on(today, 'ROLE', r.id, 'BILL_DAY', null, null) : null,
          defaultDayRateHistory: asHistory(defaults),
        };
      }),
    );
  }

  async createRole(data: {
    organizationId: string;
    name: string;
    description?: string;
    color?: string;
    permissions?: PermissionSet;
    kind?: RoleKindValue;
  }) {
    const name = (data.name || '').trim();
    if (!name) throw new BadRequestException('Role name is required');
    const kind: RoleKindValue = isRoleKind(data.kind) ? data.kind : 'MANAGEMENT';
    const slug = await this.uniqueSlug(data.organizationId, name);
    const max = await this.prisma.accessRole.aggregate({ where: { organizationId: data.organizationId }, _max: { position: true } });
    const role = await this.prisma.accessRole.create({
      data: {
        organizationId: data.organizationId,
        name,
        slug,
        description: data.description?.trim() || null,
        color: data.color || '#6b7280',
        scope: 'SPACE',
        isSystem: false,
        kind,
        // ⚠️ A work role grants nothing — forced here, whatever the request said.
        permissions: permissionsForKind(kind, this.normalizePermissions(data.permissions)) as any,
        position: (max._max.position ?? -1) + 1,
      },
    });
    return success(role, 'Space role created');
  }

  async updateRole(data: {
    organizationId: string;
    roleId: string;
    name?: string;
    description?: string;
    color?: string;
    permissions?: PermissionSet;
    isActive?: boolean;
    kind?: RoleKindValue;
    /** Ceiling on what the caller may author. Null/undefined = admin. */
    requesterPerms?: PermissionSet | null;
  }) {
    const role = await this.getOwnedRole(data.organizationId, data.roleId);
    /*
      The ceiling applies to what the role ALREADY grants, not only to the edit.

      Otherwise somebody who could not have authored a role could still rename
      it, recolour it and hand it out — keeping every permission they were never
      allowed to give. The org role paths guard delete for the same reason.
    */
    if (data.requesterPerms && permissionsExceed(data.requesterPerms, permissionsFromOrgRole(role.permissions))) {
      throw new ForbiddenException('You cannot edit a role with permissions beyond your own');
    }
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) throw new BadRequestException('Role name cannot be empty');
      patch.name = name;
      if (!role.isSystem) patch.slug = await this.uniqueSlug(data.organizationId, name, role.id);
    }
    if (data.description !== undefined) patch.description = data.description?.trim() || null;
    if (data.color !== undefined) patch.color = data.color;
    if (data.isActive !== undefined) patch.isActive = data.isActive;

    /*
      ⚠️ THE KIND CHANGES ONLY WHILE NOBODY HOLDS THE ROLE.

      A management role in use sits in `roleId` and grants authority there; a
      work role sits in `workRoleId` and grants nothing. Flipping one in place
      would either strip people of permissions with no warning or leave a trade
      sitting in the permission column. Neither is a thing to do silently.
    */
    let kind = role.kind as RoleKindValue;
    if (data.kind !== undefined && data.kind !== role.kind) {
      if (!isRoleKind(data.kind)) throw new BadRequestException('Unknown role kind');
      if (role.isSystem) throw new BadRequestException('A built-in role keeps its kind');
      const inUse = await this.prisma.spaceAssignment.count({
        where: { OR: [{ roleId: role.id }, { workRoleId: role.id }] },
      });
      if (inUse > 0) {
        throw new BadRequestException({
          message: `This role is held by ${inUse} member(s). Change their role first, then its kind.`,
          code: 'ROLE_KIND_IN_USE',
        });
      }
      kind = data.kind;
      patch.kind = kind;
    }
    if (kind === 'WORK') {
      // ⚠️ Whatever was sent, and whatever it had before: a trade grants nothing.
      patch.permissions = {};
    } else {
      if (data.permissions !== undefined) {
        patch.permissions = this.normalizePermissions({
          ...(role.permissions as PermissionSet),
          ...data.permissions,
        }) as any;
      }
    }
    const updated = await this.prisma.accessRole.update({ where: { id: role.id }, data: patch });
    return success(updated, 'Space role updated');
  }

  async deleteRole(data: { organizationId: string; roleId: string }) {
    const role = await this.getOwnedRole(data.organizationId, data.roleId);
    if (role.isSystem) throw new BadRequestException('Built-in roles cannot be deleted (deactivate instead)');
    const inUse = await this.prisma.spaceAssignment.count({
      where: { OR: [{ roleId: role.id }, { workRoleId: role.id }] },
    });
    if (inUse > 0) throw new BadRequestException(`This role is assigned to ${inUse} member(s). Reassign them first.`);
    await this.prisma.accessRole.delete({ where: { id: role.id } });
    return success({ id: role.id }, 'Space role deleted');
  }

  /**
   * A work role's day rate in ONE workspace, from a day.
   *
   * ⚠️ Never written over. Each change is a dated row, so every day already
   * worked keeps the rate it was worked at — on any invoice, raised whenever.
   */
  async setRoleDayRate(data: {
    organizationId: string;
    /** Null = the role's default for every workspace. */
    spaceId: string | null;
    roleId: string;
    cents: number | null;
    effectiveFrom?: string;
    createdById?: string;
  }) {
    if (data.spaceId) await this.assertSpaceInOrg(data.organizationId, data.spaceId);
    const role = await this.getOwnedRole(data.organizationId, data.roleId);
    if (role.kind !== 'WORK') throw new BadRequestException('Only a work role has a day rate');
    const result = await withRateErrors(() =>
      this.prisma.$transaction((tx) =>
        writeRateChange(tx as any, {
          organizationId: data.organizationId,
          target: 'ROLE',
          targetId: role.id,
          spaceId: data.spaceId,
          kind: 'BILL_DAY',
          cents: data.cents,
          effectiveFrom: data.effectiveFrom,
          createdById: data.createdById ?? null,
        }),
      ),
    );
    return success(
      { roleId: role.id, spaceId: data.spaceId, ...result },
      result.effectiveFrom > utcTodayKey() ? 'Day rate scheduled' : 'Day rate updated',
    );
  }

  // ── Members (SpaceAssignment) ───────────────────────────────────────────────

  async listMembers(data: { organizationId: string; spaceId: string }) {
    await this.assertSpaceInOrg(data.organizationId, data.spaceId);
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
      this.prisma.organization.findUnique({
        where: { id: data.organizationId },
        select: { billableRateCents: true, costRateCents: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: members.map((m) => m.userId) } },
        select: { id: true, costRateCents: true },
      }),
    ]);
    const byUser = new Map(users.map((u) => [u.id, u]));
    // Each person's day cost today, from the dated history on their profile — one query.
    const today = utcTodayKey();
    const dayRows = await this.prisma.rateHistory.findMany({
      where: {
        organizationId: data.organizationId, target: 'MEMBER', kind: 'COST_DAY',
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
          client: space
            ? { billRateCents: space.billableRateCents, costRateCents: space.costRateCents }
            : null,
          organization: org
            ? { billRateCents: org.billableRateCents, costRateCents: org.costRateCents }
            : null,
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
  }) {
    await this.assertSpaceInOrg(data.organizationId, data.spaceId);
    const target = await this.assertUserInOrg(data.organizationId, data.userId);
    /*
      ONE role picker, two columns: a trade lands in `workRoleId` (grants
      nothing), anything else in `roleId` (permissions). Re-assigning a member
      replaces the role in that slot and leaves the other slot alone — subject
      to the two-role rule.
    */
    if (data.spaceRoleId) {
      const picked = await this.getOwnedRole(data.organizationId, data.spaceRoleId);
      if (picked.kind === 'WORK') {
        if (target.isExternal) throw comboRefusal('EXTERNAL_NO_WORK_ROLE');
        const existing = await this.prisma.spaceAssignment.findUnique({
          where: { userId_spaceId: { userId: data.userId, spaceId: data.spaceId } },
          select: { roleId: true, allowSecondRole: true },
        });
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
        return success(
          { id: member.id, userId: member.userId, user: member.user, spaceRole: member.role, workRole: member.workRole },
          'Member assigned',
        );
      }
    }
    if (data.spaceRoleId) {
      const role = await this.getOwnedRole(data.organizationId, data.spaceRoleId);
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
    }

    if (data.spaceRoleId) {
      const existing = await this.prisma.spaceAssignment.findUnique({
        where: { userId_spaceId: { userId: data.userId, spaceId: data.spaceId } },
        select: { workRoleId: true, allowSecondRole: true },
      });
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
    return success(
      { id: member.id, userId: member.userId, user: member.user, spaceRole: member.role, workRole: member.workRole },
      'Member assigned',
    );
  }

  /**
   * A member's roles and billing here, edited in place: their trade, their
   * management role, whether they may hold both, and how they are billed.
   *
   * ⚠️ Undefined leaves a field alone; null clears it.
   *
   * ⚠️ The management role is the only part that is AUTHORITY, so it gets the
   * same two checks `assignMember` applies — the external allow-list and the
   * grant ceiling. The trade grants nothing and needs neither.
   */
  async updateMemberRoles(data: {
    organizationId: string;
    spaceId: string;
    memberId: string;
    workRoleId?: string | null;
    managementRoleId?: string | null;
    allowSecondRole?: boolean;
    billBy?: BillByValue | null;
    hoursBasis?: HoursBasis | null;
    requesterPerms?: PermissionSet | null;
  }) {
    const member = await this.prisma.spaceAssignment.findFirst({
      where: { id: data.memberId, organizationId: data.organizationId, spaceId: data.spaceId },
      include: { user: { select: { isExternal: true } }, role: true, workRole: true },
    });
    if (!member) throw new NotFoundException('Space member not found');

    const workRole =
      data.workRoleId === undefined
        ? member.workRole
        : data.workRoleId === null
          ? null
          : await this.getOwnedRole(data.organizationId, data.workRoleId);
    const mgmtRole =
      data.managementRoleId === undefined
        ? member.role
        : data.managementRoleId === null
          ? null
          : await this.getOwnedRole(data.organizationId, data.managementRoleId);
    const allowSecondRole = data.allowSecondRole ?? member.allowSecondRole;

    const problem = roleComboProblem({
      workRoleKind: (workRole?.kind as RoleKindValue | undefined) ?? null,
      managementRoleKind: (mgmtRole?.kind as RoleKindValue | undefined) ?? null,
      hasWorkRole: !!workRole,
      hasManagementRole: !!mgmtRole,
      allowSecondRole,
      isExternal: member.user?.isExternal === true,
    });
    if (problem) throw comboRefusal(problem);

    if (data.managementRoleId && mgmtRole && mgmtRole.id !== member.roleId) {
      if (member.user?.isExternal) {
        const forbidden = externalForbiddenIn(permissionsFromOrgRole(mgmtRole.permissions));
        if (forbidden.length) {
          throw new ForbiddenException(
            `This role cannot be given to an external member — it grants ${forbidden.map((k) => permissionLabel(k)).join(', ')}`,
          );
        }
      }
      if (data.requesterPerms && permissionsExceed(data.requesterPerms, permissionsFromOrgRole(mgmtRole.permissions))) {
        throw new ForbiddenException('You cannot grant permissions beyond your own');
      }
    }
    if (data.billBy !== undefined && data.billBy !== null && !isBillBy(data.billBy)) {
      throw new BadRequestException('Bill by must be HOUR, DAY or BOTH');
    }
    if (data.billBy && member.user?.isExternal) {
      throw new BadRequestException('An external member is not billed by you');
    }
    if (data.hoursBasis !== undefined && data.hoursBasis !== null && !isHoursBasis(data.hoursBasis)) {
      throw new BadRequestException('Hours on the invoice must be COUNTED, CLOCKED or SHIFT');
    }
    if (data.hoursBasis && member.user?.isExternal) {
      throw new BadRequestException('An external member is not billed by you');
    }

    const updated = await this.prisma.spaceAssignment.update({
      where: { id: member.id },
      data: {
        ...(data.workRoleId !== undefined && { workRoleId: workRole?.id ?? null }),
        ...(data.managementRoleId !== undefined && { roleId: mgmtRole?.id ?? null }),
        ...(data.allowSecondRole !== undefined && { allowSecondRole }),
        ...(data.billBy !== undefined && { billBy: data.billBy }),
        // COUNTED is the default: store it as null so "never chosen" and "counted" stay one answer.
        ...(data.hoursBasis !== undefined && { hoursBasis: data.hoursBasis === 'COUNTED' ? null : data.hoursBasis }),
      },
      include: { user: userSelect, role: roleSelect, workRole: roleSelect },
    });
    return success(
      {
        id: updated.id,
        userId: updated.userId,
        user: updated.user,
        spaceRole: updated.role,
        workRole: updated.workRole,
        allowSecondRole: updated.allowSecondRole,
        billBy: updated.billBy,
        effectiveBillBy: effectiveBillBy(updated.billBy as BillByValue | null),
        hoursBasis: updated.hoursBasis,
        effectiveHoursBasis: effectiveHoursBasis(updated.hoursBasis),
      },
      'Member updated',
    );
  }

  async removeMember(data: { organizationId: string; spaceId: string; memberId: string }) {
    const member = await this.prisma.spaceAssignment.findFirst({
      where: { id: data.memberId, organizationId: data.organizationId, spaceId: data.spaceId },
    });
    if (!member) throw new NotFoundException('Space member not found');
    await this.prisma.spaceAssignment.delete({ where: { id: member.id } });
    return success({ id: member.id }, 'Member removed');
  }

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
          writeRateChange(tx as any, {
            organizationId: data.organizationId,
            target: 'ASSIGNMENT',
            targetId: member.id,
            kind,
            cents,
            effectiveFrom: data.effectiveFrom,
            createdById: data.createdById ?? null,
          });
        if (data.billRateCents !== undefined) patch.billRateCents = (await write('BILL_HOUR', data.billRateCents)).nowCents;
        if (data.costRateCents !== undefined) patch.costRateCents = (await write('COST_HOUR', data.costRateCents)).nowCents;
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
          ? !!(await this.prisma.companyLocation.findFirst({ where: { id: data.targetId, organizationId: data.organizationId }, select: { id: true } }))
          : data.target === 'MEMBER'
            ? !!(await this.prisma.user.findFirst({ where: { id: data.targetId, organizationId: data.organizationId }, select: { id: true } }))
            : !!(await this.prisma.spaceAssignment.findFirst({
                where: { id: data.targetId, organizationId: data.organizationId, ...(data.spaceId ? { spaceId: data.spaceId } : {}) },
                select: { id: true },
              }));
    if (!owned) throw new NotFoundException('Not found');
    const rows = await this.prisma.rateHistory.findMany({
      where: { organizationId: data.organizationId, target: data.target, targetId: data.targetId, kind: { in: data.kinds }, spaceId: null },
      orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }],
      select: { kind: true, cents: true, effectiveFrom: true },
    });
    const today = utcTodayKey();
    return success(
      rows.map((r) => {
        const day = r.effectiveFrom.toISOString().slice(0, 10);
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
    const arr = (v?: string[]) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined);
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

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async ensureBuiltInRoles(organizationId: string) {
    // Seed any missing built-ins (idempotent by slug). Covers fresh orgs.
    for (const p of BUILTIN_ROLES) {
      await this.prisma.accessRole.upsert({
        where: { organizationId_slug: { organizationId, slug: p.slug } },
        update: {},
        create: {
          organizationId,
          name: p.name,
          slug: p.slug,
          description: p.description,
          color: p.color,
          scope: p.scope as any,
          isSystem: true,
          permissions: p.permissions as any,
        },
      });
    }
  }

  private normalizePermissions(input?: PermissionSet): PermissionSet {
    const out: PermissionSet = {};
    for (const key of SPACE_PERMISSION_KEYS) if (input?.[key] === true) out[key] = true;
    return out;
  }

  private async getOwnedRole(organizationId: string, roleId: string) {
    const role = await this.prisma.accessRole.findFirst({
      where: { id: roleId, organizationId, scope: { in: ['SPACE', 'BOTH'] } },
    });
    if (!role) throw new NotFoundException('Space role not found');
    return role;
  }

  private async assertSpaceInOrg(organizationId: string, spaceId: string) {
    const space = await this.prisma.companyLocation.findFirst({ where: { id: spaceId, organizationId }, select: { id: true } });
    if (!space) throw new NotFoundException('Space not found');
  }

  /** Tenancy check that also answers who the member works for — one query, both facts. */
  private async assertUserInOrg(organizationId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true, isExternal: true },
    });
    if (!user) throw new NotFoundException('User not found in this organization');
    return user;
  }

  /**
   * A slug nothing else in the org is using.
   *
   * One query, and it terminates by construction. It used to be `while (true)`
   * around a findFirst — a loop with no bound whose only exit was the database
   * disagreeing, costing one round trip per collision and spinning forever if
   * that answer never came. Neither failure needs to be reachable to be worth
   * removing from a path that runs while a request is held open.
   *
   * Reading every sibling slug at once also makes the cost flat: ten roles
   * called "Shift Leader" cost one query, not ten.
   */
  private async uniqueSlug(organizationId: string, name: string, excludeId?: string): Promise<string> {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'role';

    const siblings = await this.prisma.accessRole.findMany({
      where: {
        organizationId,
        slug: { startsWith: base },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { slug: true },
    });
    const taken = new Set(siblings.map((r) => r.slug));

    if (!taken.has(base)) return base;
    // Bounded by the number of rows that could possibly clash: with N siblings
    // taken, one of base-2 … base-(N+2) is necessarily free.
    for (let n = 2; n <= taken.size + 2; n++) {
      const candidate = `${base}-${n}`;
      if (!taken.has(candidate)) return candidate;
    }
    // Unreachable by the pigeonhole argument above; a slug that is unique
    // anyway beats throwing on a name.
    return `${base}-${Date.now()}`;
  }
}
