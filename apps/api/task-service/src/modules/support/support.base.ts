import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  personName,
  SERVICE_NAMES,
  QUEUE_NAMES,
  resolveTeamForOrg,
  normalizeSupportScope,
  ticketInSupportScope,
  PERSON_BRIEF_SELECT,
  type RoutingConditions,
} from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * What every support path shares: the SLA job, a ticket an agent may act on,
 * agents' names, the team for an organization, unread counts, and who raised it.
 */
@Injectable()
export abstract class SupportBase {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    protected readonly notificationClient: ClientProxy,
    @InjectQueue(QUEUE_NAMES.SUPPORT)
    protected readonly supportQueue: Queue,
  ) {}


  protected slaJobId(ticketId: string) {
    return `support-sla-${ticketId}`;
  }

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
  protected async agentTicket(ticketId: string, rawScope: unknown) {
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
  protected async agentNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (!unique.length) return new Map();
    const ops = await this.prisma.platformUser.findMany({
      where: { id: { in: unique } },
      select: PERSON_BRIEF_SELECT,
    });
    return new Map(ops.map((o) => [o.id, personName(o) || o.email]));
  }

  /**
   * Resolve which support team owns an org's tickets (manual pin > routing rule >
   * null triage). Shared pure resolver over the org's attributes + active rules.
   */
  protected async resolveTeamForOrg(organizationId: string): Promise<string | null> {
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
      rules.map((r) => ({ teamId: r.teamId, isActive: r.isActive, order: r.order, conditions: r.conditions as RoutingConditions | null })),
    );
  }

  /**
   * Attach per-ticket unread counts for the given reader with ONE groupBy (no
   * N+1). Unread = inbound messages from the OTHER party not yet read, excluding
   * internal notes.
   */
  protected async attachUnread<T extends { id: string }>(rows: T[], reader: 'CUSTOMER' | 'AGENT') {
    if (rows.length === 0) return rows as (T & { unreadForCustomer?: number; unreadForAgent?: number })[];
    const fromType = reader === 'CUSTOMER' ? 'AGENT' : 'CUSTOMER';
    const readField = reader === 'CUSTOMER' ? 'readByCustomerAt' : 'readByAgentAt';
    const grouped = await this.prisma.supportMessage.groupBy({
      by: ['ticketId'],
      where: { ticketId: { in: rows.map((r) => r.id) }, authorType: fromType, isInternalNote: false, [readField]: null },
      _count: { _all: true },
    });
    const map = new Map(grouped.map((g) => [g.ticketId, g._count._all]));
    const key = reader === 'CUSTOMER' ? 'unreadForCustomer' : 'unreadForAgent';
    return rows.map((r) => ({ ...r, [key]: map.get(r.id) ?? 0 }));
  }

  protected async cancelSlaJob(ticketId: string) {
    try {
      const job = await this.supportQueue.getJob(this.slaJobId(ticketId));
      if (job) await job.remove();
    } catch (e) {
      this.logger.debug(`cancelSlaJob(${ticketId}) noop: ${(e as Error).message}`);
    }
  }

  protected createdBySelect() {
    return { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } };
  }
}
