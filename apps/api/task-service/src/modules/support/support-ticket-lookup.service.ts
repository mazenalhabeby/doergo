import { Injectable, NotFoundException } from '@nestjs/common';
import {
  personName,
  resolveTeamForOrg,
  normalizeSupportScope,
  ticketInSupportScope,
  type RoutingConditions,
  activeSupportRoutingRules,
  orgSupportFacts,
  operatorNames,
  PrismaService,
} from '@hbcfield/shared';

/**
 * Reads every support path shares: a ticket an agent may act on, agents' names,
 * the team for an organization, and unread counts.
 */
@Injectable()
export class SupportTicketLookup {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The one door every AGENT action on a single ticket goes through.
   *
   * The inbox was scoped to the caller's teams, but opening, answering,
   * re-routing, closing or marking a ticket read took only its id — so a
   * scoped agent could reach any ticket by guessing one. The same rule now
   * decides both (shared `support-scope.ts`), and a ticket outside it is 404,
   * exactly like one that does not exist: a 403 would confirm it is there.
   *
   * `scope` is REQUIRED on the agent path. The static-key operator page passes
   * a supervisor scope explicitly; a call that forgot it gets the narrowest
   * scope (triage only), never everything.
   */
  async agentTicket(ticketId: string, rawScope: unknown) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket || !ticketInSupportScope(ticket, normalizeSupportScope(rawScope))) {
      throw new NotFoundException('Ticket not found');
    }
    return ticket;
  }

  /**
   * Operator names, read at display time.
   *
   * `assignedAgentId` and an agent message's `authorId` now hold the platform
   * user's ID (a name can change; an id is what the "assigned to me" view and
   * the scope match on). Rows written before that hold a display name — those
   * simply find no operator here and are shown as written.
   */
  async agentNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (!unique.length) return new Map();
    const ops = await operatorNames(this.prisma, unique);
    return new Map(ops.map((o) => [o.id, personName(o) || o.email]));
  }

  /**
   * Resolve which support team owns an org's tickets (manual pin > routing rule >
   * null triage). Shared pure resolver over the org's attributes + active rules.
   */
  async resolveTeamForOrg(organizationId: string): Promise<string | null> {
    const [org, rules] = await this.prisma.$transaction([
      orgSupportFacts(this.prisma, organizationId),
      activeSupportRoutingRules(this.prisma),
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
      rules.map((r) => ({
        teamId: r.teamId,
        isActive: r.isActive,
        order: r.order,
        conditions: r.conditions as RoutingConditions | null,
      })),
    );
  }

  /**
   * Attach per-ticket unread counts for the given reader with ONE groupBy (no
   * N+1). Unread = inbound messages from the OTHER party not yet read, excluding
   * internal notes.
   */
  async attachUnread<T extends { id: string }>(rows: T[], reader: 'CUSTOMER' | 'AGENT') {
    if (rows.length === 0) return rows as (T & { unreadForCustomer?: number; unreadForAgent?: number })[];
    const fromType = reader === 'CUSTOMER' ? 'AGENT' : 'CUSTOMER';
    const readField = reader === 'CUSTOMER' ? 'readByCustomerAt' : 'readByAgentAt';
    const grouped = await this.prisma.supportMessage.groupBy({
      by: ['ticketId'],
      where: {
        ticketId: { in: rows.map((r) => r.id) },
        authorType: fromType,
        isInternalNote: false,
        [readField]: null,
      },
      _count: { _all: true },
    });
    const map = new Map(grouped.map((g) => [g.ticketId, g._count._all]));
    const key = reader === 'CUSTOMER' ? 'unreadForCustomer' : 'unreadForAgent';
    return rows.map((r) => ({ ...r, [key]: map.get(r.id) ?? 0 }));
  }
}
