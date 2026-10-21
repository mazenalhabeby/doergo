import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import {
  clampListLimit,
  clampListPage,
  paginated,
  normalizeSupportScope,
  supportScopeWhere,
  type SupportAgentScope,
} from '@hbcfield/shared';
import { publicMessageWhere } from './support-helpers';
import { SupportBase } from './support.base';
import type { Prisma, SupportStatus } from '@prisma/client';

/** Reading support: a customer's tickets, one thread, and the agents' inbox. */
@Injectable()
export class SupportInboxService extends SupportBase {
  // ── reads ──────────────────────────────────────────────────────────────────
  async listForCustomer(data: { createdById: string; status?: string; page?: number; limit?: number }) {
    const page = clampListPage(data.page);
    const limit = clampListLimit(data.limit, 20, 100);
    const where: Prisma.SupportTicketWhereInput = { createdById: data.createdById };
    if (data.status) where.status = data.status as SupportStatus;
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
    return paginated(enriched, { page, limit, total });
  }

  async getThread(data: {
    ticketId: string;
    organizationId?: string;
    userId?: string;
    asAgent?: boolean;
    scope?: SupportAgentScope;
  }) {
    if (data.asAgent) await this.agentTicket(data.ticketId, data.scope);
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
    if (!data.asAgent) return { success: true, data: ticket };
    // Agents see who handled it by NAME; the id stays for the "mine" match.
    const names = await this.agentNames([
      ticket.assignedAgentId,
      ...ticket.messages.filter((m) => m.authorType === 'AGENT').map((m) => m.authorId),
    ]);
    return {
      success: true,
      data: {
        ...ticket,
        assignedAgentName: ticket.assignedAgentId
          ? (names.get(ticket.assignedAgentId) ?? ticket.assignedAgentId)
          : null,
        messages: ticket.messages.map((m) =>
          m.authorType === 'AGENT'
            ? { ...m, authorName: (m.authorId && names.get(m.authorId)) || m.authorId || 'agent' }
            : m,
        ),
      },
    };
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
    const page = clampListPage(data.page);
    const limit = clampListLimit(data.limit, 25, 100);
    const where: Prisma.SupportTicketWhereInput = {};
    if (data.status) where.status = data.status as SupportStatus;
    else where.status = { in: ['OPEN', 'PENDING_AGENT', 'PENDING_CUSTOMER'] };
    if (data.tier) where.planTierAtCreation = data.tier;
    if (data.atRisk) {
      // Awaiting first reply and not yet breached — the queue that needs attention.
      where.slaBreached = false;
      where.firstRespondedAt = null;
    }

    // ── Access scoping ────────────────────────────────────────────────────────
    // The SAME rule every single-ticket action asks (agentTicket above).
    const scope = normalizeSupportScope({
      isSupervisor: data.isSupervisor,
      teamIds: data.teamIds,
      platformUserId: data.agentId,
    });
    const allowed = supportScopeWhere(scope);
    const teamIds = scope.teamIds;

    // Optional explicit view narrows further, but never beyond `allowed`.
    const viewClauses: Prisma.SupportTicketWhereInput[] = [];
    if (data.view === 'mine' && scope.platformUserId) viewClauses.push({ assignedAgentId: scope.platformUserId });
    else if (data.view === 'unassigned') viewClauses.push({ assignedTeamId: null });
    else if (data.view === 'team' && teamIds.length) viewClauses.push({ assignedTeamId: { in: teamIds } });

    const andParts: Prisma.SupportTicketWhereInput[] = [];
    if (allowed) andParts.push(allowed);
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
    const names = await this.agentNames(rows.map((r) => r.assignedAgentId));
    return paginated(
      enriched.map((r) => ({
        ...r,
        assignedAgentName: r.assignedAgentId ? (names.get(r.assignedAgentId) ?? r.assignedAgentId) : null,
      })),
      { page, limit, total },
    );
  }

  /** The operator deleted a support team: its tickets keep their history and go back to no team. */
  async unassignTeam(teamId: string) {
    if (!teamId) return { success: false, count: 0 };
    const { count } = await this.prisma.supportTicket.updateMany({
      where: { assignedTeamId: teamId },
      data: { assignedTeamId: null },
    });
    return { success: true, count };
  }
}
