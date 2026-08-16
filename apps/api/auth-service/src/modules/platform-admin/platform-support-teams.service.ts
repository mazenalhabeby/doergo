import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RoutingConditions } from '@hbcfield/shared';

const ok = <T>(data: T) => ({ success: true, data });
const fail = (message: string, statusCode = 400) => ({ success: false, statusCode, message });

/**
 * Support Teams administration (platform-level). Teams own books of business via
 * routing rules + manual org pins; membership scopes the agent inbox. All methods
 * are gated at the gateway by `manageSupportTeams` (except member self-scope reads).
 */
@Injectable()
export class PlatformSupportTeamsService {
  private readonly logger = new Logger(PlatformSupportTeamsService.name);
  constructor(private readonly prisma: PrismaService) {}

  /** Active platform staff — for the "add member" picker (manageSupportTeams). */
  async listStaff() {
    const users = await this.prisma.platformUser.findMany({
      where: { isActive: true },
      select: { id: true, firstName: true, lastName: true, email: true, role: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    return ok(users);
  }

  // ── Teams ──────────────────────────────────────────────────────────────────
  async listTeams() {
    const teams = await this.prisma.supportTeam.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: {
        members: true,
        routingRules: { orderBy: { order: 'asc' } },
        _count: { select: { members: true, routingRules: true, pinnedOrgs: true } },
      },
    });
    // Hydrate member display names from platform_users in one query.
    const ids = [...new Set(teams.flatMap((t) => t.members.map((m) => m.platformUserId)))];
    const users = ids.length
      ? await this.prisma.platformUser.findMany({
          where: { id: { in: ids } },
          select: { id: true, firstName: true, lastName: true, email: true, role: true, isActive: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return ok(
      teams.map((t) => ({
        ...t,
        members: t.members.map((m) => ({ ...m, user: byId.get(m.platformUserId) ?? null })),
      })),
    );
  }

  async createTeam(d: { name: string; color?: string; description?: string }) {
    if (!d?.name?.trim()) return fail('Team name is required');
    const team = await this.prisma.supportTeam.create({
      data: { name: d.name.trim().slice(0, 80), color: d.color ?? null, description: d.description ?? null },
    });
    return ok(team);
  }

  async updateTeam(d: { teamId: string; name?: string; color?: string | null; description?: string | null; isActive?: boolean }) {
    const patch: Record<string, any> = {};
    if (d.name !== undefined) patch.name = d.name.trim().slice(0, 80);
    if (d.color !== undefined) patch.color = d.color;
    if (d.description !== undefined) patch.description = d.description;
    if (d.isActive !== undefined) patch.isActive = d.isActive;
    const team = await this.prisma.supportTeam.update({ where: { id: d.teamId }, data: patch });
    return ok(team);
  }

  async deleteTeam(d: { teamId: string }) {
    // Detach pinned orgs + null out tickets so nothing dangles; rules/members cascade.
    await this.prisma.$transaction([
      this.prisma.organization.updateMany({ where: { supportTeamId: d.teamId }, data: { supportTeamId: null } }),
      this.prisma.supportTicket.updateMany({ where: { assignedTeamId: d.teamId }, data: { assignedTeamId: null } }),
      this.prisma.supportTeam.delete({ where: { id: d.teamId } }),
    ]);
    return ok({ deleted: true });
  }

  // ── Members ──────────────────────────────────────────────────────────────────
  async addMember(d: { teamId: string; platformUserId: string; teamRole?: 'MANAGER' | 'AGENT' }) {
    const user = await this.prisma.platformUser.findUnique({ where: { id: d.platformUserId } });
    if (!user) return fail('Platform user not found', 404);
    const member = await this.prisma.supportTeamMember.upsert({
      where: { teamId_platformUserId: { teamId: d.teamId, platformUserId: d.platformUserId } },
      create: { teamId: d.teamId, platformUserId: d.platformUserId, teamRole: (d.teamRole as any) ?? 'AGENT' },
      update: { teamRole: (d.teamRole as any) ?? 'AGENT' },
    });
    return ok(member);
  }

  async removeMember(d: { teamId: string; platformUserId: string }) {
    await this.prisma.supportTeamMember.deleteMany({ where: { teamId: d.teamId, platformUserId: d.platformUserId } });
    return ok({ removed: true });
  }

  // ── Routing rules ─────────────────────────────────────────────────────────────
  async upsertRule(d: {
    id?: string;
    teamId: string;
    name: string;
    conditions: RoutingConditions;
    order?: number;
    isActive?: boolean;
  }) {
    if (!d?.name?.trim()) return fail('Rule name is required');
    const data = {
      name: d.name.trim().slice(0, 80),
      conditions: (d.conditions ?? {}) as any,
      order: d.order ?? 0,
      isActive: d.isActive ?? true,
    };
    const rule = d.id
      ? await this.prisma.supportRoutingRule.update({ where: { id: d.id }, data })
      : await this.prisma.supportRoutingRule.create({ data: { ...data, teamId: d.teamId } });
    return ok(rule);
  }

  async deleteRule(d: { ruleId: string }) {
    await this.prisma.supportRoutingRule.delete({ where: { id: d.ruleId } });
    return ok({ deleted: true });
  }

  // ── Manual org pin (overrides rules) ────────────────────────────────────────
  async pinOrg(d: { organizationId: string; teamId: string | null }) {
    const org = await this.prisma.organization.update({
      where: { id: d.organizationId },
      data: { supportTeamId: d.teamId },
      select: { id: true, name: true, supportTeamId: true },
    });
    return ok(org);
  }

  /** Orgs manually pinned to a team (for the team detail view). */
  async listPinnedOrgs(d: { teamId: string }) {
    const orgs = await this.prisma.organization.findMany({
      where: { supportTeamId: d.teamId },
      select: { id: true, name: true, planTier: true, country: true, industry: true },
      orderBy: { name: 'asc' },
    });
    return ok(orgs);
  }
}
