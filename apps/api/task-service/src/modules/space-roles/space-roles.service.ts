import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { assertSpaceInOrg } from '../../common/tenant-scope.util';
import {
  success,
  permissionsExceed,
  permissionsFromOrgRole,
  isRoleKind,
  permissionsForKind,
  loadRateBook,
  utcTodayKey,
  type PermissionSet,
  type RoleKindValue,
  maxRolePosition,
  spaceRoleCards,
  spaceRolesWithCounts,
} from '@hbcfield/shared';
import { assertNameFree, getOwnedRole, uniqueSlug, useWorkRoleIn } from './space-role-rules';
import { userSelect, normalizePermissions } from './space-roles-helpers';
import { RoleWriter } from './role-writer.service';
import { PrismaService } from '@hbcfield/shared';
import type { SpaceRoleWrite } from '@hbcfield/shared/microservices';

export { type SpaceMemberAuthority } from './space-roles-helpers';

/**
 * Space roles + space membership on the UNIFIED model (AccessRole scope=SPACE +
 * SpaceAssignment). Replaces the legacy SpaceRole/SpaceMember stack. Also stores
 * the per-member, per-space routing override (who is notified about / who this
 * member may contact within the space).
 *
 * Org-scoped: organizationId always from the caller's token; spaceId/userId are
 * verified in-org before use. Delegation (space-manager) is enforced at the
 * gateway against the resource's own spaceId. *
 * ⚠️ WHO WRITES `AccessRole` (docs/data-ownership.md, group D, owner decision 2026-10-20).
 * auth-service owns the table. The rules of a SPACE role live here — WORK vs MANAGEMENT kind (a work
 * role's permissions forced to `{}`), the grant ceiling against the caller's own space authority — so
 * this service decides every column and `RoleWriter` asks auth-service to write it (create, edit, the
 * built-in sync). MERGING and DELETING a role stay here (role-admin.service): they move assignments,
 * workspace role lists and day rates in ONE transaction with the role — the agreed exception.
 */
@Injectable()
export class SpaceRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writer: RoleWriter,
  ) {}

  // ── Roles (AccessRole, scope SPACE) ────────────────────────────────────────

  async listRoles(data: { organizationId: string }) {
    await this.writer.ensureBuiltIns(data.organizationId);
    const roles = await spaceRolesWithCounts(this.prisma, data.organizationId);
    return success(
      roles.map(({ _count, ...r }) => ({
        ...r,
        _count: { members: _count.spaceAssignments + _count.workAssignments },
      })),
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
    await assertSpaceInOrg(this.prisma, data.spaceId, data.organizationId);
    await this.writer.ensureBuiltIns(data.organizationId);
    const usedHere = new Set(
      (await this.prisma.companyLocation.findUnique({ where: { id: data.spaceId }, select: { workRoleIds: true } }))
        ?.workRoleIds ?? [],
    );
    const [roles, assignments] = await Promise.all([
      spaceRoleCards(this.prisma, data.organizationId),
      this.prisma.spaceAssignment.findMany({
        where: { organizationId: data.organizationId, spaceId: data.spaceId },
        select: { roleId: true, workRoleId: true, user: userSelect },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const workRoleIds = roles.filter((r) => r.kind === 'WORK').map((r) => r.id);
    const book = await loadRateBook(this.prisma, data.organizationId, {
      roleIds: workRoleIds,
      roleSpaceId: data.spaceId,
    });
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
          rows.map((row) => ({
            cents: row.cents,
            effectiveFrom: row.effectiveFrom,
            state: row.effectiveFrom > today ? 'scheduled' : 'past',
          }));
        return {
          ...r,
          holders,
          /** A work role switched on in THIS workspace (shown here, offered in its pickers). Held = on. */
          activeHere: isWork ? usedHere.has(r.id) || holders.length > 0 : true,
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
    /** Made from a workspace: a work role is switched on there at once. */
    spaceId?: string;
  }) {
    const name = (data.name || '').trim();
    if (data.spaceId) await assertSpaceInOrg(this.prisma, data.spaceId, data.organizationId, { activeOnly: true });
    if (!name) throw new BadRequestException('Role name is required');
    const kind: RoleKindValue = isRoleKind(data.kind) ? data.kind : 'MANAGEMENT';
    await assertNameFree(this.prisma, data.organizationId, name);
    const slug = await uniqueSlug(this.prisma, data.organizationId, name);
    const max = await maxRolePosition(this.prisma, data.organizationId);
    // auth-service writes it (it owns AccessRole); every column is decided here.
    const role = await this.writer.create(data.organizationId, {
      name,
      slug,
      description: data.description?.trim() || null,
      color: data.color || '#6b7280',
      scope: 'SPACE',
      isSystem: false,
      kind,
      // ⚠️ A work role grants nothing — forced here, whatever the request said.
      permissions: permissionsForKind(kind, normalizePermissions(data.permissions)) as Record<string, boolean>,
      position: (max._max.position ?? -1) + 1,
    });
    if (data.spaceId && kind === 'WORK') await useWorkRoleIn(this.prisma, data.spaceId, role.id);
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
    const role = await getOwnedRole(this.prisma, data.organizationId, data.roleId);
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
      if (name.toLowerCase() !== role.name.toLowerCase())
        await assertNameFree(this.prisma, data.organizationId, name, role.id);
      patch.name = name;
      if (!role.isSystem) patch.slug = await uniqueSlug(this.prisma, data.organizationId, name, role.id);
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
        patch.permissions = normalizePermissions({
          ...(role.permissions as PermissionSet),
          ...data.permissions,
        });
        /*
          ⚠️ An admin's edit to a BUILT-IN makes it the organization's own.
          The built-in catch-up (shared builtin-role-sync) re-grants what a
          definition holds to every built-in NOT marked customized — and an
          unticked permission is stored as absent, indistinguishable from
          "never had it". Without the flag, unticking "approve overtime" on the
          Shift Leader was undone the next time the list loaded. auth-service
          sets the same flag on its own edit path.
        */
        if (role.isSystem && JSON.stringify(patch.permissions) !== JSON.stringify(role.permissions)) {
          patch.isCustomized = true;
        }
      }
    }
    const updated = await this.writer.update(data.organizationId, role.id, patch as SpaceRoleWrite);
    return success(updated, 'Space role updated');
  }
}
