import type { Prisma } from '@prisma/client';
import { Injectable, Logger } from '@nestjs/common';
import { clampListLimit } from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

import { type PlatformAuditInput } from '@hbcfield/shared/microservices';
const ACTOR_TYPES = new Set(['STAFF', 'STATIC_KEY', 'ANONYMOUS']);
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length ? v.slice(0, max) : null);

/** The message contract's type (shared with the gateway). */
export type { PlatformAuditInput };

/**
 * The operator audit trail — written for every platform mutation and every
 * static-key call (gateway PlatformAuditInterceptor, the agent socket), read by
 * Owners on the console's Audit tab.
 *
 * APPEND-ONLY. This service has a `write` and a `list` and nothing else; the
 * table also refuses UPDATE and DELETE at the database (migration
 * 20261010120000_platform_console_hardening).
 */
@Injectable()
export class PlatformAuditService {
  private readonly logger = new Logger(PlatformAuditService.name);
  constructor(private readonly prisma: PrismaService) {}

  async write(input: PlatformAuditInput) {
    try {
      const actorType = ACTOR_TYPES.has(String(input?.actorType)) ? String(input.actorType) : 'ANONYMOUS';
      await this.prisma.platformAuditLog.create({
        data: {
          actorType,
          actorId: actorType === 'STAFF' ? str(input.actorId, 64) : null,
          actorLabel: str(input.actorLabel, 200),
          actorRole: str(input.actorRole, 32),
          ipAddress: str(input.ipAddress, 100),
          userAgent: str(input.userAgent, 300),
          method: str(input.method, 10) ?? 'UNKNOWN',
          route: str(input.route, 300) ?? '',
          action: str(input.action, 100) ?? 'UNKNOWN',
          targetOrganizationId: str(input.targetOrganizationId, 64),
          summary:
            input.summary === undefined
              ? undefined
              : (JSON.parse(JSON.stringify(input.summary ?? null)) as Prisma.InputJsonValue),
          ok: input.ok === true,
          statusCode: typeof input.statusCode === 'number' ? input.statusCode : null,
          error: str(input.error, 500),
        },
      });
      return { success: true };
    } catch (e) {
      // Never fails the caller's request — but loudly, because a silent gap in
      // an audit trail is the one failure nobody notices.
      this.logger.error(`[PLATFORM-AUDIT] write failed: ${String(e)}`);
      return { success: false, statusCode: 500, message: 'Audit write failed' };
    }
  }

  /** Newest first, cursor-paginated (the cursor is the last row's id). */
  async list(params: { cursor?: string; limit?: number; actorId?: string; organizationId?: string } = {}) {
    const limit = clampListLimit(params.limit, 50, 200);
    const where: Record<string, unknown> = {};
    if (params.actorId) where.actorId = params.actorId;
    if (params.organizationId) where.targetOrganizationId = params.organizationId;
    const rows = await this.prisma.platformAuditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    // The organization's NAME beside its id — one lookup for the page.
    const orgIds = [...new Set(page.map((r) => r.targetOrganizationId).filter((x): x is string => !!x))];
    const orgs = orgIds.length
      ? await this.prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })
      : [];
    const names = new Map(orgs.map((o) => [o.id, o.name]));
    return {
      success: true,
      data: page.map((r) => ({
        ...r,
        targetOrganizationName: r.targetOrganizationId ? (names.get(r.targetOrganizationId) ?? null) : null,
      })),
      nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
    };
  }
}
