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
    asAgent?: boolean; // agent path — already authorized upstream
  }) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: data.ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (!data.asAgent && ticket.organizationId !== data.organizationId) {
      throw new ForbiddenException('Not your ticket');
    }

    const now = new Date();
    const isAgent = data.authorType === 'AGENT';
    const isInternal = isAgent && !!data.isInternalNote;

    const message = await this.prisma.supportMessage.create({
      data: {
        ticketId: data.ticketId,
        authorId: data.authorId,
        authorType: data.authorType,
        body: data.body,
        attachments: (data.attachments ?? []) as any,
        isInternalNote: isInternal,
      },
    });

    // Derive the ticket state transition from who spoke.
    const patch: Record<string, any> = {};
    if (!isInternal) {
      if (isAgent) {
        patch.lastAgentMessageAt = now;
        patch.status = 'PENDING_CUSTOMER';
        if (!ticket.firstRespondedAt) {
          patch.firstRespondedAt = now;
          // First human reply landed — stop the breach clock (unless already breached).
          await this.cancelSlaJob(ticket.id);
        }
      } else {
        patch.lastCustomerMessageAt = now;
        // A customer reply reopens a resolved ticket back into our queue.
        patch.status = 'PENDING_AGENT';
      }
    }
    const updated = Object.keys(patch).length
      ? await this.prisma.supportTicket.update({ where: { id: ticket.id }, data: patch })
      : ticket;

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
  async assign(data: { ticketId: string; agentId: string | null }) {
    const ticket = await this.prisma.supportTicket.update({
      where: { id: data.ticketId },
      data: { assignedAgentId: data.agentId },
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

  async markRead(data: { ticketId: string; reader: 'CUSTOMER' | 'AGENT' }) {
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
    return { data: rows, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getThread(data: { ticketId: string; organizationId?: string; asAgent?: boolean }) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: data.ticketId },
      include: {
        createdBy: this.createdBySelect(),
        messages: {
          where: data.asAgent ? undefined : publicMessageWhere,
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (!data.asAgent && ticket.organizationId !== data.organizationId) {
      throw new ForbiddenException('Not your ticket');
    }
    return { success: true, data: ticket };
  }

  async agentInbox(data: { status?: string; tier?: string; atRisk?: boolean; page?: number; limit?: number }) {
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
    return { data: rows, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
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
