import { Injectable, BadRequestException } from '@nestjs/common';
import { assertSpaceInOrg } from '../../common/tenant-scope.util';
import { success, writeRateChange, utcTodayKey } from '@hbcfield/shared';
import { withRateErrors } from './space-roles-helpers';
import { SpaceRolesBase } from './space-roles.base';

/**
 * Managing a role as a whole: merging two, switching a work role on in a
 * workspace, deleting, its default day rate.
 */
@Injectable()
export class RoleAdminService extends SpaceRolesBase {
  /**
   * Fold one work role into another — the clean-up for two roles that are the
   * same trade ("Electric" twice, priced in different workspaces).
   *
   * Its holders move to the kept role; its day rates move too, per workspace,
   * wherever the kept role has none there (where both priced the same workspace
   * the kept role's figures stand). Role ids in routing and document lists are
   * replaced. Then the merged role is deleted. Invoices keep the rates and role
   * names saved on their lines, so nothing already billed moves. One transaction.
   */
  async mergeRole(data: { organizationId: string; roleId: string; intoRoleId: string }) {
    if (data.roleId === data.intoRoleId) throw new BadRequestException('A role cannot be merged into itself');
    const [from, into] = await Promise.all([
      this.getOwnedRole(data.organizationId, data.roleId),
      this.getOwnedRole(data.organizationId, data.intoRoleId),
    ]);
    if (from.isSystem) throw new BadRequestException('A built-in role cannot be merged away');
    if (from.kind !== 'WORK' || into.kind !== 'WORK') {
      throw new BadRequestException('Only work roles (trades) can be merged');
    }
    const moved = await this.prisma.$transaction(async (tx) => {
      const holders = await tx.spaceAssignment.updateMany({
        where: { organizationId: data.organizationId, workRoleId: from.id },
        data: { workRoleId: into.id },
      });
      // Day rates: the kept role's own figures win in any workspace it already prices.
      const kept = await tx.rateHistory.findMany({
        where: { organizationId: data.organizationId, target: 'ROLE', targetId: into.id },
        select: { spaceId: true },
      });
      const priced = new Set(kept.map((r) => r.spaceId ?? '__default__'));
      const fromRows = await tx.rateHistory.findMany({
        where: { organizationId: data.organizationId, target: 'ROLE', targetId: from.id },
        select: { id: true, spaceId: true },
      });
      const moveIds = fromRows.filter((r) => !priced.has(r.spaceId ?? '__default__')).map((r) => r.id);
      const dropIds = fromRows.filter((r) => priced.has(r.spaceId ?? '__default__')).map((r) => r.id);
      if (moveIds.length)
        await tx.rateHistory.updateMany({ where: { id: { in: moveIds } }, data: { targetId: into.id } });
      if (dropIds.length) await tx.rateHistory.deleteMany({ where: { id: { in: dropIds } } });
      // Where the merged role was PRICED, the kept role is now used — even if the
      // merged one had been switched off there in the meantime.
      for (const spaceId of new Set(fromRows.map((r) => r.spaceId).filter((x): x is string => !!x))) {
        await this.useWorkRoleIn(tx, spaceId, into.id);
      }
      // Any list that names the role by id names the kept one instead.
      // The workspaces that used the merged role now use the kept one — once each.
      await tx.$executeRawUnsafe(
        `UPDATE "company_locations" SET "workRoleIds" = ARRAY(SELECT DISTINCT ` +
          `unnest(array_replace("workRoleIds", $1, $2))) WHERE "organizationId" = ` +
          `$3 AND $1 = ANY("workRoleIds")`,
        from.id,
        into.id,
        data.organizationId,
      );
      for (const [table, cols] of [
        ['company_locations', ['notifyRoleIds', 'contactRoleIds', 'approveRoleIds']],
        ['space_assignments', ['notifyRoleIds', 'contactRoleIds', 'approveRoleIds']],
        ['document_types', ['requiredFromRoleIds', 'visibleToRoleIds']],
        ['documents', ['visibleToRoleIds']],
      ] as const) {
        for (const col of cols) {
          await tx.$executeRawUnsafe(
            `UPDATE "${table}" SET "${col}" = array_remove(array_replace("${col}", ` +
              `$1, $2), NULL) WHERE "organizationId" = $3 AND $1 = ANY("${col}")`,
            from.id,
            into.id,
            data.organizationId,
          );
        }
      }
      await tx.accessRole.delete({ where: { id: from.id } });
      return { holders: holders.count, rates: moveIds.length };
    });
    return success({ id: from.id, intoRoleId: into.id, ...moved }, 'Roles merged');
  }

  /**
   * Switch a company work role on or off in ONE workspace. Off only while
   * nobody here holds it — a person's trade must stay a role this workspace uses.
   */
  async setWorkRoleHere(data: { organizationId: string; spaceId: string; roleId: string; active: boolean }) {
    await assertSpaceInOrg(this.prisma, data.spaceId, data.organizationId, { activeOnly: data.active });
    const role = await this.getOwnedRole(data.organizationId, data.roleId);
    if (role.kind !== 'WORK') throw new BadRequestException('Only a work role is switched on per workspace');
    if (data.active) {
      await this.useWorkRoleIn(this.prisma, data.spaceId, role.id);
    } else {
      const held = await this.prisma.spaceAssignment.count({ where: { spaceId: data.spaceId, workRoleId: role.id } });
      if (held > 0) {
        throw new BadRequestException({
          message: `${held} member(s) here hold ${role.name}. Give them another work role first.`,
          code: 'WORK_ROLE_HELD_HERE',
          params: { count: held, name: role.name },
        });
      }
      await this.prisma.$executeRawUnsafe(
        `UPDATE "company_locations" SET "workRoleIds" = array_remove("workRoleIds", $1) WHERE "id" = $2`,
        role.id,
        data.spaceId,
      );
    }
    return success({ roleId: role.id, spaceId: data.spaceId, active: data.active });
  }

  async deleteRole(data: { organizationId: string; roleId: string }) {
    const role = await this.getOwnedRole(data.organizationId, data.roleId);
    if (role.isSystem) throw new BadRequestException('Built-in roles cannot be deleted (deactivate instead)');
    const inUse = await this.prisma.spaceAssignment.count({
      where: { OR: [{ roleId: role.id }, { workRoleId: role.id }] },
    });
    if (inUse > 0) throw new BadRequestException(`This role is assigned to ${inUse} member(s). Reassign them first.`);
    // Nothing of it may linger: its dated day rates, and its place in every workspace's list.
    await this.prisma.$transaction(async (tx) => {
      await tx.rateHistory.deleteMany({
        where: { organizationId: data.organizationId, target: 'ROLE', targetId: role.id },
      });
      await tx.$executeRawUnsafe(
        `UPDATE "company_locations" SET "workRoleIds" = ` +
          `array_remove("workRoleIds", $1) WHERE "organizationId" = $2 AND $1 = ` +
          `ANY("workRoleIds")`,
        role.id,
        data.organizationId,
      );
      await tx.accessRole.delete({ where: { id: role.id } });
    });
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
    if (data.spaceId) await assertSpaceInOrg(this.prisma, data.spaceId, data.organizationId, { activeOnly: true });
    const role = await this.getOwnedRole(data.organizationId, data.roleId);
    if (role.kind !== 'WORK') throw new BadRequestException('Only a work role has a day rate');
    const result = await withRateErrors(() =>
      this.prisma.$transaction((tx) =>
        writeRateChange(tx, {
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
    // Pricing a role in a workspace is using it there.
    if (data.spaceId && role.kind === 'WORK') await this.useWorkRoleIn(this.prisma, data.spaceId, role.id);
    return success(
      { roleId: role.id, spaceId: data.spaceId, ...result },
      result.effectiveFrom > utcTodayKey() ? 'Day rate scheduled' : 'Day rate updated',
    );
  }
}
