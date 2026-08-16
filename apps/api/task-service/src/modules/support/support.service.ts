import { Injectable, Inject, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  SERVICE_NAMES,
  QUEUE_NAMES,
  SUPPORT_JOB_TYPES,
  supportTierPriority,
  slaFirstResponseDueAt,
  resolveTeamForOrg,
  type PlanTier,
  type SupportAuthorType,
  type SupportStatus,
} from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

type Attachment = { fileName: string; fileUrl: string; fileType: string; fileSize: number };

// Customers never see internal agent notes; agents see everything.
const publicMessageWhere = { isInternalNote: false } as const;

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
    @InjectQueue(QUEUE_NAMES.SUPPORT)
    private readonly supportQueue: Queue,
  ) {}

  private slaJobId(ticketId: string) {
    return `support-sla-${ticketId}`;
  }

  /**
   * Resolve which support team owns an org's tickets (manual pin > routing rule >
   * null triage). Shared pure resolver over the org's attributes + active rules.
   */
  private async resolveTeamForOrg(organizationId: string): Promise<string | null> {
    const [org, rules] = await this.prisma.$transaction([
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { planTier: true, country: true, state: true, industry: true, supportTeamId: true },
      }),
      this.prisma.supportRoutingRule.findMany({
        where: { isActive: true },
        select: { teamId: true, isActive: true, order: true, conditions: true },
        orderBy: { order: 'asc' },
      }),
    ]);
    if (!org) return null;
    return resolveTeamForOrg(
      {
        planTier: org.planTier as string | null,
        country: org.country,
        state: org.state,
        industry: org.industry,
        supportTeamId: org.supportTeamId,
      },
      rules.map((r) => ({ teamId: r.teamId, isActive: r.isActive, order: r.order, conditions: r.conditions as any })),
    );
  }

  // ── customer: create ticket ────────────────────────────────────────────────
  async createTicket(data: {
    organizationId: string;
    createdById: string;
    planTier?: string | null;
    subject: string;
    category?: string;
    channel?: string;
    body: string;
    attachments?: Attachment[];
  }) {
    const now = new Date();
    const tier = (data.planTier ?? null) as PlanTier | null;
    const priority = supportTierPriority(tier);
    const dueAt = slaFirstResponseDueAt(tier, now);

    // Dynamic routing: resolve the owning team from the org's manual pin / rules.
    const assignedTeamId = await this.resolveTeamForOrg(data.organizationId);

    const ticket = await this.prisma.supportTicket.create({
      data: {
        organizationId: data.organizationId,
        createdById: data.createdById,
        subject: data.subject.trim().slice(0, 200),
        category: (data.category as any) ?? 'OTHER',
        channel: (data.channel as any) ?? 'WEB',
        status: 'OPEN',
        priority,
        planTierAtCreation: data.planTier ?? null,
        assignedTeamId,
        slaFirstResponseDueAt: dueAt,
        lastCustomerMessageAt: now,
        messages: {
          create: {
            authorId: data.createdById,
            authorType: 'CUSTOMER',
            body: data.body,
            attachments: (data.attachments ?? []) as any,
          },
        },
      },
      include: { messages: true, createdBy: this.createdBySelect() },
    });

    // Schedule the SLA-breach check exactly at the deadline (cancelled on first reply).
    const delay = Math.max(0, dueAt.getTime() - now.getTime());
    await this.supportQueue.add(
      SUPPORT_JOB_TYPES.SLA_BREACH_CHECK,
      { ticketId: ticket.id },
      { jobId: this.slaJobId(ticket.id), delay, removeOnComplete: true, removeOnFail: true },
    );

    this.notificationClient.emit('support_ticket_created', { ticket });
    return { success: true, data: ticket };
  }

  // ── add a message (customer reply, agent reply, or internal note) ───────────
  async addMessage(data: {
    ticketId: string;
    authorId: string;
    authorType: SupportAuthorType;
    body: string;
    attachments?: Attachment[];
    isInternalNote?: boolean;
    // Authorization context (one of):
    organizationId?: string; // customer path — must own the ticket's org
    userId?: string; // customer path — must be the ticket OWNER (not just same org)
    asAgent?: boolean; // agent path — already authorized upstream
  }) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: data.ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    // A customer may only touch a ticket they OPENED — org-scope alone would let a
    // coworker read/reply to someone else's private ticket by id (IDOR).
    if (!data.asAgent && (ticket.organizationId !== data.organizationId || ticket.createdById !== data.userId)) {
      throw new ForbiddenException('Not your ticket');
    }
    // Closed tickets are archived — a customer reply must not resurrect them.
    if (!data.asAgent && ticket.status === 'CLOSED') {
      throw new ForbiddenException('This ticket is closed — please open a new request.');
    }

    const now = new Date();
    const isAgent = data.authorType === 'AGENT';
    const isInternal = isAgent && !!data.isInternalNote;

    // Decide the ticket state transition BEFORE writing so message + ticket commit
    // together (a message must never persist with stale ticket status/timestamps).
    const patch: Record<string, any> = {};
    let firstAgentReply = false;
    if (!isInternal) {
      if (isAgent) {
        patch.lastAgentMessageAt = now;
        patch.status = 'PENDING_CUSTOMER';
        if (!ticket.firstRespondedAt) {
          patch.firstRespondedAt = now;
          firstAgentReply = true;
        }
      } else {
        patch.lastCustomerMessageAt = now;
        // A customer reply reopens a resolved ticket back into our queue.
        patch.status = 'PENDING_AGENT';
      }
    }

    const writes: any[] = [
      this.prisma.supportMessage.create({
        data: {
          ticketId: data.ticketId,
          authorId: data.authorId,
          authorType: data.authorType,
          body: data.body,
          attachments: (data.attachments ?? []) as any,
          isInternalNote: isInternal,
        },
      }),
    ];
    if (Object.keys(patch).length) {
      writes.push(this.prisma.supportTicket.update({ where: { id: ticket.id }, data: patch }));
    }
    const results = await this.prisma.$transaction(writes);
    const message = results[0];
    const updated = Object.keys(patch).length ? results[results.length - 1] : ticket;

    // First human reply landed — stop the breach clock (after the reply is committed).
    if (firstAgentReply) await this.cancelSlaJob(ticket.id);

    // Real-time + push: internal notes go only to agents.
    this.notificationClient.emit('support_message', {
      ticketId: ticket.id,
      message,
      ticket: updated,
      isInternalNote: isInternal,
      customerId: ticket.createdById,
      organizationId: ticket.organizationId,
    });
    if (!isInternal) {
      this.notificationClient.emit('support_ticket_updated', { ticket: updated });
    }
    return { success: true, data: message };
  }

  // ── agent: assign / status ─────────────────────────────────────────────────
  // Assign to an individual agent and/or reassign to a team. Passing `agentId`
  // and/or `teamId` (each optional) patches only the provided fields; pass null
  // to clear. Reassigning the team moves the ticket between scoped queues.
  async assign(data: { ticketId: string; agentId?: string | null; teamId?: string | null }) {
    const patch: Record<string, any> = {};
    if ('agentId' in data) patch.assignedAgentId = data.agentId ?? null;
    if ('teamId' in data) patch.assignedTeamId = data.teamId ?? null;
    const ticket = await this.prisma.supportTicket.update({
      where: { id: data.ticketId },
      data: patch,
    });
    this.notificationClient.emit('support_ticket_updated', { ticket });
    return { success: true, data: ticket };
  }

  async setStatus(data: { ticketId: string; status: SupportStatus }) {
    const now = new Date();
    const extra: Record<string, any> = {};
    if (data.status === 'RESOLVED') extra.resolvedAt = now;
    if (data.status === 'CLOSED') extra.closedAt = now;
    const ticket = await this.prisma.supportTicket.update({
      where: { id: data.ticketId },
      data: { status: data.status, ...extra },
    });
    this.notificationClient.emit('support_ticket_updated', { ticket });
    return { success: true, data: ticket };
  }

  async markRead(data: { ticketId: string; reader: 'CUSTOMER' | 'AGENT'; userId?: string }) {
    // Customer path must own the ticket — otherwise any authed user could mark
    // someone else's ticket read by id (write IDOR).
    if (data.reader === 'CUSTOMER') {
      const ticket = await this.prisma.supportTicket.findUnique({
        where: { id: data.ticketId },
        select: { createdById: true },
      });
      if (!ticket || ticket.createdById !== data.userId) {
        throw new ForbiddenException('Not your ticket');
      }
    }
    const now = new Date();
    const field = data.reader === 'CUSTOMER' ? 'readByCustomerAt' : 'readByAgentAt';
    // Mark unread inbound messages (from the OTHER party) as read.
    const fromType = data.reader === 'CUSTOMER' ? 'AGENT' : 'CUSTOMER';
    await this.prisma.supportMessage.updateMany({
      where: { ticketId: data.ticketId, authorType: fromType, [field]: null },
      data: { [field]: now },
    });
    return { success: true };
  }

  // ── reads ──────────────────────────────────────────────────────────────────
  async listForCustomer(data: { createdById: string; status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(data.page) || 1);
    const limit = Math.min(Math.max(1, Number(data.limit) || 20), 100);
    const where: any = { createdById: data.createdById };
    if (data.status) where.status = data.status;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.supportTicket.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    const enriched = await this.attachUnread(rows, 'CUSTOMER');
    return { data: enriched, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getThread(data: { ticketId: string; organizationId?: string; userId?: string; asAgent?: boolean }) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: data.ticketId },
      include: {
        createdBy: this.createdBySelect(),
        messages: {
          where: data.asAgent ? undefined : publicMessageWhere,
          orderBy: { createdAt: 'asc' },
          take: 500, // defensive cap — real threads are tiny; guards against abuse
        },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    // Owner-scoped for customers (not just same-org) — see addMessage note (IDOR).
    if (!data.asAgent && (ticket.organizationId !== data.organizationId || ticket.createdById !== data.userId)) {
      throw new ForbiddenException('Not your ticket');
    }
    return { success: true, data: ticket };
  }

  /**
   * Attach per-ticket unread counts for the given reader with ONE groupBy (no
   * N+1). Unread = inbound messages from the OTHER party not yet read, excluding
   * internal notes.
   */
  private async attachUnread<T extends { id: string }>(rows: T[], reader: 'CUSTOMER' | 'AGENT') {
    if (rows.length === 0) return rows as (T & { unreadForCustomer?: number; unreadForAgent?: number })[];
    const fromType = reader === 'CUSTOMER' ? 'AGENT' : 'CUSTOMER';
    const readField = reader === 'CUSTOMER' ? 'readByCustomerAt' : 'readByAgentAt';
    const grouped = await this.prisma.supportMessage.groupBy({
      by: ['ticketId'],
      where: { ticketId: { in: rows.map((r) => r.id) }, authorType: fromType, isInternalNote: false, [readField]: null } as any,
      _count: { _all: true },
    });
    const map = new Map(grouped.map((g) => [g.ticketId, g._count._all]));
    const key = reader === 'CUSTOMER' ? 'unreadForCustomer' : 'unreadForAgent';
    return rows.map((r) => ({ ...r, [key]: map.get(r.id) ?? 0 }));
  }

  async agentInbox(data: {
    status?: string;
    tier?: string;
    atRisk?: boolean;
    page?: number;
    limit?: number;
    // Caller scope (from the platform token). Supervisors see everything; others
    // see their teams' queue + the unassigned triage queue + their own tickets.
    isSupervisor?: boolean;
    teamIds?: string[];
    agentId?: string;
    // Optional explicit view within what the caller is allowed to see.
    view?: 'all' | 'mine' | 'unassigned' | 'team';
  }) {
    const page = Math.max(1, Number(data.page) || 1);
    const limit = Math.min(Math.max(1, Number(data.limit) || 25), 100);
    const where: any = {};
    if (data.status) where.status = data.status;
    else where.status = { in: ['OPEN', 'PENDING_AGENT', 'PENDING_CUSTOMER'] };
    if (data.tier) where.planTierAtCreation = data.tier;
    if (data.atRisk) {
      // Awaiting first reply and not yet breached — the queue that needs attention.
      where.slaBreached = false;
      where.firstRespondedAt = null;
    }

    // ── Access scoping ────────────────────────────────────────────────────────
    const teamIds = Array.isArray(data.teamIds) ? data.teamIds.filter(Boolean) : [];
    // The set of tickets this caller is permitted to see.
    const allowed: any[] = data.isSupervisor
      ? [] // supervisors: no restriction
      : [
          { assignedTeamId: null }, // unassigned triage queue
          ...(teamIds.length ? [{ assignedTeamId: { in: teamIds } }] : []),
          ...(data.agentId ? [{ assignedAgentId: data.agentId }] : []),
        ];

    // Optional explicit view narrows further, but never beyond `allowed`.
    const viewClauses: any[] = [];
    if (data.view === 'mine' && data.agentId) viewClauses.push({ assignedAgentId: data.agentId });
    else if (data.view === 'unassigned') viewClauses.push({ assignedTeamId: null });
    else if (data.view === 'team' && teamIds.length) viewClauses.push({ assignedTeamId: { in: teamIds } });

    const andParts: any[] = [];
    if (allowed.length) andParts.push({ OR: allowed });
    if (viewClauses.length) andParts.push({ OR: viewClauses });
    if (andParts.length) where.AND = andParts;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.supportTicket.findMany({
        where,
        // Priority routing: highest-priority (lowest number) then oldest first.
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { createdBy: this.createdBySelect() },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    const enriched = await this.attachUnread(rows, 'AGENT');
    return { data: enriched, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── SLA breach (delayed BullMQ job) ─────────────────────────────────────────
  async checkSlaBreach(data: { ticketId: string }) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: data.ticketId } });
    // Already answered / gone / already flagged → nothing to do.
    if (!ticket || ticket.firstRespondedAt || ticket.slaBreached) return { success: true, breached: false };
    if (['RESOLVED', 'CLOSED'].includes(ticket.status)) return { success: true, breached: false };

    const updated = await this.prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { slaBreached: true },
    });
    this.logger.warn(`SLA breached on ticket ${ticket.id} (tier ${ticket.planTierAtCreation})`);
    this.notificationClient.emit('support_sla_breached', { ticket: updated });
    this.notificationClient.emit('support_ticket_updated', { ticket: updated });
    return { success: true, breached: true };
  }

  private async cancelSlaJob(ticketId: string) {
    try {
      const job = await this.supportQueue.getJob(this.slaJobId(ticketId));
      if (job) await job.remove();
    } catch (e) {
      this.logger.debug(`cancelSlaJob(${ticketId}) noop: ${(e as Error).message}`);
    }
  }

  private createdBySelect() {
    return { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } };
  }
}
