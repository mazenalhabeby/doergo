import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import {
  SUPPORT_JOB_TYPES,
  supportPriority,
  slaFirstResponseDueAt,
  resolveTeamForOrg,
  type SupportAuthorType,
  type SupportStatus,
  type SupportAgentScope,
} from '@hbcfield/shared';
import { findPrior } from '../../common/create-once.util';
import { Attachment } from './support-helpers';
import { SupportBase } from './support.base';
import {
  emitEvent,
  supportMessageEvent,
  supportSlaBreachedEvent,
  supportTicketCreatedEvent,
  supportTicketUpdatedEvent,
} from '@hbcfield/shared/microservices';

@Injectable()
export class SupportService extends SupportBase {
  // ── customer: create ticket ────────────────────────────────────────────────
  async createTicket(data: {
    organizationId: string;
    createdById: string;
    /** What the org bought — decides queue priority and the SLA promise. */
    orgAddOns?: string[] | null;
    subject: string;
    category?: string;
    channel?: string;
    body: string;
    attachments?: Attachment[];
    /** Made on the phone: a ticket sent twice is one ticket. */
    id?: string;
  }) {
    const prior = await findPrior({
      id: data.id,
      find: (id) =>
        this.prisma.supportTicket.findUnique({
          where: { id },
          include: { messages: true, createdBy: this.createdBySelect() },
        }),
      isSame: (t) => t.createdById === data.createdById,
    });
    if (prior) return { success: true, data: prior };

    const now = new Date();
    // What they bought decides both the queue position and the promise.
    const addOns = (data.orgAddOns ?? []) as string[];
    const priority = supportPriority(addOns);
    const dueAt = slaFirstResponseDueAt(addOns, now);

    // Dynamic routing: resolve the owning team from the org's manual pin / rules.
    const assignedTeamId = await this.resolveTeamForOrg(data.organizationId);

    const ticket = await this.prisma.supportTicket.create({
      data: {
        ...(data.id ? { id: data.id } : {}),
        organizationId: data.organizationId,
        createdById: data.createdById,
        subject: data.subject.trim().slice(0, 200),
        category: (data.category as any) ?? 'OTHER',
        channel: (data.channel as any) ?? 'WEB',
        status: 'OPEN',
        priority,
        // Kept as a record of what they had bought when the ticket was
        // opened — an SLA breach months later has to be judged against the
        // promise made then, not what they are paying for now.
        planTierAtCreation: (data.orgAddOns ?? []).join(',') || null,
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

    emitEvent(this.notificationClient, supportTicketCreatedEvent, { ticket });
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
    asAgent?: boolean; // agent path — scoped by `scope`
    scope?: SupportAgentScope;
    /** Made on the phone: a reply sent twice is one reply. */
    id?: string;
  }) {
    const ticket = data.asAgent
      ? await this.agentTicket(data.ticketId, data.scope)
      : await this.prisma.supportTicket.findUnique({ where: { id: data.ticketId } });
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

    // Asked after the ownership check above, so a guessed id reveals nothing.
    const prior = await findPrior({
      id: data.id,
      find: (id) => this.prisma.supportMessage.findUnique({ where: { id } }),
      isSame: (m) => m.ticketId === data.ticketId && m.authorId === data.authorId,
    });
    if (prior) return { success: true, data: prior };

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
          ...(data.id ? { id: data.id } : {}),
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
    emitEvent(this.notificationClient, supportMessageEvent, {
      ticketId: ticket.id,
      message,
      ticket: updated,
      isInternalNote: isInternal,
      customerId: ticket.createdById,
      organizationId: ticket.organizationId,
    });
    if (!isInternal) {
      emitEvent(this.notificationClient, supportTicketUpdatedEvent, { ticket: updated });
    }
    return { success: true, data: message };
  }

  // ── agent: assign / status ─────────────────────────────────────────────────
  // Assign to an individual agent and/or reassign to a team. Passing `agentId`
  // and/or `teamId` (each optional) patches only the provided fields; pass null
  // to clear. Reassigning the team moves the ticket between scoped queues.
  async assign(data: { ticketId: string; agentId?: string | null; teamId?: string | null; scope?: SupportAgentScope }) {
    await this.agentTicket(data.ticketId, data.scope);
    const patch: Record<string, any> = {};
    if ('agentId' in data) patch.assignedAgentId = data.agentId ?? null;
    if ('teamId' in data) patch.assignedTeamId = data.teamId ?? null;
    const ticket = await this.prisma.supportTicket.update({
      where: { id: data.ticketId },
      data: patch,
    });
    emitEvent(this.notificationClient, supportTicketUpdatedEvent, { ticket });
    return { success: true, data: ticket };
  }

  async setStatus(data: { ticketId: string; status: SupportStatus; scope?: SupportAgentScope }) {
    await this.agentTicket(data.ticketId, data.scope);
    const now = new Date();
    const extra: Record<string, any> = {};
    if (data.status === 'RESOLVED') extra.resolvedAt = now;
    if (data.status === 'CLOSED') extra.closedAt = now;
    const ticket = await this.prisma.supportTicket.update({
      where: { id: data.ticketId },
      data: { status: data.status, ...extra },
    });
    emitEvent(this.notificationClient, supportTicketUpdatedEvent, { ticket });
    return { success: true, data: ticket };
  }

  async markRead(data: { ticketId: string; reader: 'CUSTOMER' | 'AGENT'; userId?: string; scope?: SupportAgentScope }) {
    if (data.reader === 'AGENT') await this.agentTicket(data.ticketId, data.scope);
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
    emitEvent(this.notificationClient, supportSlaBreachedEvent, { ticket: updated });
    emitEvent(this.notificationClient, supportTicketUpdatedEvent, { ticket: updated });
    return { success: true, breached: true };
  }
}
