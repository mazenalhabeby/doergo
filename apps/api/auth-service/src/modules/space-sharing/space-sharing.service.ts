import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

type Level = 'VIEW' | 'CONTRIBUTE' | 'CONTROL';
const LEVELS: Level[] = ['VIEW', 'CONTRIBUTE', 'CONTROL'];

/**
 * Cross-org space sharing. All mutations are org-scoped and identity-checked
 * server-side: the OWNER side asserts the space belongs to the caller's org; the
 * GUEST side asserts the share was addressed to the caller's org. A share only
 * grants access while status = ACTIVE (set on the guest's explicit accept).
 */
@Injectable()
export class SpaceSharingService {
  private readonly logger = new Logger(SpaceSharingService.name);
  constructor(private readonly prisma: PrismaService) {}

  private err(message: string, statusCode = HttpStatus.BAD_REQUEST) {
    return { success: false as const, message, statusCode };
  }

  private async ownerAssertSpace(spaceId: string, ownerOrgId: string) {
    return this.prisma.companyLocation.findFirst({
      where: { id: spaceId, organizationId: ownerOrgId },
      select: { id: true, name: true, organizationId: true },
    });
  }

  // ── OWNER: create/invite a share ──────────────────────────────────────────
  async createShare(data: {
    ownerOrgId: string;
    createdById: string;
    spaceId: string;
    guestOrgCode: string; // the guest org's join code (secret) — resolves the target org
    level?: Level;
    showWorkers?: boolean;
    showAttendance?: boolean;
    showTracking?: boolean;
    showReports?: boolean;
    allowRequests?: boolean;
  }) {
    const space = await this.ownerAssertSpace(data.spaceId, data.ownerOrgId);
    if (!space) return this.err('Space not found', HttpStatus.NOT_FOUND);

    const code = (data.guestOrgCode || '').trim();
    if (!code) return this.err('A guest organization code is required');
    const guest = await this.prisma.organization.findFirst({
      where: { joinCode: code, isActive: true },
      select: { id: true, name: true },
    });
    if (!guest) return this.err('No organization matches that code', HttpStatus.NOT_FOUND);
    if (guest.id === data.ownerOrgId) return this.err('You cannot share a space with your own organization');

    const level: Level = LEVELS.includes(data.level as Level) ? (data.level as Level) : 'VIEW';

    // Idempotent per (space, guest): re-inviting a revoked/declined share re-opens it.
    const existing = await this.prisma.spaceShare.findUnique({
      where: { spaceId_guestOrgId: { spaceId: data.spaceId, guestOrgId: guest.id } },
      select: { id: true, status: true },
    });
    const scope = {
      showWorkers: data.showWorkers ?? true,
      showAttendance: data.showAttendance ?? false,
      showTracking: data.showTracking ?? false,
      showReports: data.showReports ?? false,
      allowRequests: data.allowRequests ?? true,
    };

    let share;
    if (existing) {
      if (existing.status === 'ACTIVE') return this.err('This space is already shared with that organization');
      share = await this.prisma.spaceShare.update({
        where: { id: existing.id },
        data: { level, status: 'PENDING', createdById: data.createdById, acceptedAt: null, acceptedById: null, ...scope },
      });
    } else {
      share = await this.prisma.spaceShare.create({
        data: {
          spaceId: data.spaceId,
          ownerOrgId: data.ownerOrgId,
          guestOrgId: guest.id,
          level,
          status: 'PENDING',
          createdById: data.createdById,
          ...scope,
        },
      });
    }
    return { success: true as const, data: { ...share, guestOrgName: guest.name, spaceName: space.name } };
  }

  // ── OWNER: update level / scope ───────────────────────────────────────────
  async updateShare(data: {
    ownerOrgId: string;
    shareId: string;
    level?: Level;
    showWorkers?: boolean;
    showAttendance?: boolean;
    showTracking?: boolean;
    showReports?: boolean;
    allowRequests?: boolean;
  }) {
    const share = await this.prisma.spaceShare.findFirst({
      where: { id: data.shareId, ownerOrgId: data.ownerOrgId },
      select: { id: true, guestOrgId: true },
    });
    if (!share) return this.err('Share not found', HttpStatus.NOT_FOUND);
    const patch: any = {};
    if (data.level && LEVELS.includes(data.level)) patch.level = data.level;
    for (const k of ['showWorkers', 'showAttendance', 'showTracking', 'showReports', 'allowRequests'] as const) {
      if (data[k] !== undefined) patch[k] = !!data[k];
    }
    const updated = await this.prisma.spaceShare.update({ where: { id: share.id }, data: patch });
    return { success: true as const, data: updated, guestOrgId: share.guestOrgId };
  }

  // ── OWNER: revoke ─────────────────────────────────────────────────────────
  async revokeShare(data: { ownerOrgId: string; shareId: string }) {
    const share = await this.prisma.spaceShare.findFirst({
      where: { id: data.shareId, ownerOrgId: data.ownerOrgId },
      select: { id: true, guestOrgId: true, spaceId: true },
    });
    if (!share) return this.err('Share not found', HttpStatus.NOT_FOUND);
    // Revocation severs the relationship fully: mark REVOKED and REMOVE any
    // cross-org members the guest added to this space (rows tagged with the guest
    // org), so they don't linger in the owner's roster / task-assign after revoke.
    await this.prisma.$transaction([
      this.prisma.spaceShare.update({ where: { id: share.id }, data: { status: 'REVOKED' } }),
      this.prisma.spaceAssignment.deleteMany({
        where: { spaceId: share.spaceId, organizationId: share.guestOrgId },
      }),
    ]);
    return { success: true as const, guestOrgId: share.guestOrgId };
  }

  // ── OWNER: list shares for a space ────────────────────────────────────────
  async listForSpace(data: { ownerOrgId: string; spaceId: string }) {
    const space = await this.ownerAssertSpace(data.spaceId, data.ownerOrgId);
    if (!space) return this.err('Space not found', HttpStatus.NOT_FOUND);
    const shares = await this.prisma.spaceShare.findMany({
      where: { spaceId: data.spaceId, ownerOrgId: data.ownerOrgId, status: { not: 'REVOKED' } },
      orderBy: { createdAt: 'desc' },
    });
    const guestIds = [...new Set(shares.map((s) => s.guestOrgId))];
    const orgs = await this.prisma.organization.findMany({ where: { id: { in: guestIds } }, select: { id: true, name: true } });
    const name = new Map(orgs.map((o) => [o.id, o.name]));
    return { success: true as const, data: shares.map((s) => ({ ...s, guestOrgName: name.get(s.guestOrgId) ?? null })) };
  }

  // ── GUEST: list shares addressed to my org (pending invites + active) ──────
  async listIncoming(data: { guestOrgId: string }) {
    const shares = await this.prisma.spaceShare.findMany({
      where: { guestOrgId: data.guestOrgId, status: { in: ['PENDING', 'ACTIVE'] } },
      orderBy: { createdAt: 'desc' },
    });
    const spaceIds = shares.map((s) => s.spaceId);
    const ownerIds = [...new Set(shares.map((s) => s.ownerOrgId))];
    const [spaces, orgs] = await Promise.all([
      this.prisma.companyLocation.findMany({ where: { id: { in: spaceIds } }, select: { id: true, name: true } }),
      this.prisma.organization.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } }),
    ]);
    const spaceName = new Map(spaces.map((s) => [s.id, s.name]));
    const orgName = new Map(orgs.map((o) => [o.id, o.name]));
    return {
      success: true as const,
      data: shares.map((s) => ({ ...s, spaceName: spaceName.get(s.spaceId) ?? null, ownerOrgName: orgName.get(s.ownerOrgId) ?? null })),
    };
  }

  // ── GUEST: accept / decline an invite ─────────────────────────────────────
  async respondToShare(data: { guestOrgId: string; shareId: string; accept: boolean; userId: string }) {
    const share = await this.prisma.spaceShare.findFirst({
      where: { id: data.shareId, guestOrgId: data.guestOrgId, status: 'PENDING' },
      select: { id: true },
    });
    if (!share) return this.err('Invite not found or already handled', HttpStatus.NOT_FOUND);
    const updated = await this.prisma.spaceShare.update({
      where: { id: share.id },
      data: data.accept
        ? { status: 'ACTIVE', acceptedAt: new Date(), acceptedById: data.userId }
        : { status: 'DECLINED' },
    });
    return { success: true as const, data: updated };
  }

  // ── GUEST: request more (task/worker) on a shared space ───────────────────
  async createRequest(data: {
    guestOrgId: string;
    userId: string;
    shareId: string;
    type: 'TASK' | 'WORKER';
    title: string;
    note?: string;
  }) {
    const share = await this.prisma.spaceShare.findFirst({
      where: { id: data.shareId, guestOrgId: data.guestOrgId, status: 'ACTIVE' },
      select: { id: true, spaceId: true, allowRequests: true },
    });
    if (!share) return this.err('Shared space not found', HttpStatus.NOT_FOUND);
    if (!share.allowRequests) return this.err('The owner has disabled requests for this space', HttpStatus.FORBIDDEN);
    if (!data.title?.trim()) return this.err('A title is required');
    const req = await this.prisma.spaceShareRequest.create({
      data: {
        shareId: share.id,
        spaceId: share.spaceId,
        guestOrgId: data.guestOrgId,
        requestedById: data.userId,
        type: data.type === 'WORKER' ? 'WORKER' : 'TASK',
        title: data.title.trim().slice(0, 200),
        note: data.note?.trim()?.slice(0, 1000) || null,
      },
    });
    return { success: true as const, data: req };
  }

  // ── list requests: owner (by space) or guest (their own) ──────────────────
  async listRequests(data: { spaceId: string; ownerOrgId?: string; guestOrgId?: string; status?: string }) {
    // Owner path: assert space ownership. Guest path: scope to their org.
    if (data.ownerOrgId) {
      const space = await this.ownerAssertSpace(data.spaceId, data.ownerOrgId);
      if (!space) return this.err('Space not found', HttpStatus.NOT_FOUND);
    }
    const where: any = { spaceId: data.spaceId };
    if (data.guestOrgId) where.guestOrgId = data.guestOrgId;
    if (data.status) where.status = data.status;
    const requests = await this.prisma.spaceShareRequest.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
    return { success: true as const, data: requests };
  }

  // ── OWNER: resolve a request (approve/reject). Discrete, one-shot. ─────────
  async resolveRequest(data: { ownerOrgId: string; requestId: string; approve: boolean; userId: string }) {
    const req = await this.prisma.spaceShareRequest.findFirst({
      where: { id: data.requestId, status: 'PENDING' },
      select: { id: true, spaceId: true },
    });
    if (!req) return this.err('Request not found or already handled', HttpStatus.NOT_FOUND);
    // Defense-in-depth: the request's space must belong to the owner's org.
    const space = await this.ownerAssertSpace(req.spaceId, data.ownerOrgId);
    if (!space) return this.err('Not authorized for this request', HttpStatus.FORBIDDEN);
    const updated = await this.prisma.spaceShareRequest.update({
      where: { id: req.id },
      data: { status: data.approve ? 'APPROVED' : 'REJECTED', resolvedById: data.userId, resolvedAt: new Date() },
    });
    return { success: true as const, data: updated };
  }
}
