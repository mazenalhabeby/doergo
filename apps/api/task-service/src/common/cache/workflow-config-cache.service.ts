import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Per-org cache of StatusWorkflows (with statuses + capabilities).
 *
 * Workflows/capabilities are read on every task-detail resolution but change
 * rarely, so we cache them per organization and invalidate on any workflow/status
 * write. This keeps task-flow resolution O(1) from memory instead of joining
 * workflow_statuses on every request. Best-effort: if Redis is down we read
 * straight from Postgres.
 */
@Injectable()
export class WorkflowConfigCache {
  private readonly logger = new Logger(WorkflowConfigCache.name);
  private readonly redis: Redis;
  private readonly ttl: number;

  constructor(private readonly prisma: PrismaService, config: ConfigService) {
    this.ttl = Number(config.get('WORKFLOW_CACHE_TTL_SECONDS')) || 600;
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST') || 'localhost',
      port: Number(config.get('REDIS_PORT')) || 6379,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      lazyConnect: false,
    });
    this.redis.on('error', (err) => this.logger.warn(`Workflow cache Redis error: ${err.message}`));
  }

  private key(orgId: string): string {
    return `wf:org:${orgId}`;
  }

  /** All active workflows for an org (cached), each with ordered statuses. */
  async getOrgWorkflows(orgId: string): Promise<any[]> {
    try {
      const cached = await this.redis.get(this.key(orgId));
      if (cached) return JSON.parse(cached);
    } catch {
      // fall through to DB
    }
    const workflows = await this.prisma.statusWorkflow.findMany({
      where: { organizationId: orgId },
      include: { statuses: { orderBy: { position: 'asc' } } },
    });
    try {
      await this.redis.set(this.key(orgId), JSON.stringify(workflows), 'EX', this.ttl);
    } catch {
      // cache write failures must never break reads
    }
    return workflows;
  }

  /** Resolve one workflow (with statuses) by id, from the cached org set. */
  async getWorkflow(orgId: string, workflowId?: string | null): Promise<any | null> {
    if (!workflowId) return null;
    const all = await this.getOrgWorkflows(orgId);
    return all.find((w) => w.id === workflowId) ?? null;
  }

  /** Drop the org's cached workflows — call on any workflow/status change. */
  async invalidate(orgId: string): Promise<void> {
    try {
      await this.redis.del(this.key(orgId));
    } catch {
      // best effort — entry expires within WORKFLOW_CACHE_TTL_SECONDS anyway
    }
  }
}
