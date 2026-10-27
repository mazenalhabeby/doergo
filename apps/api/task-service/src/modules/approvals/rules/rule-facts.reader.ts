import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ABSENCE_WHERE, personName, type RuleFacts, type RuleKind } from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { CoverService } from '../../technicians/cover.service';
import { MAX_ITEMS, clientRequestItems, hoursItems, namesOf, noShowItems, proposalItems } from './rule-facts-kinds';

/** One item a rule could apply to, as a rule reads it. */
export interface RuleItem {
  itemId: string;
  since: Date;
  subjectId: string | null;
  subjectName: string;
  facts: RuleFacts;
}

/**
 * Which window of items to read: still WAITING since before a moment (the "nobody answers" sweep), or
 * EVERY item raised since a day, decided or not (what a rule would have touched — the rules page's numbers).
 */
export type RuleItemWindow = { waitingBefore: Date; since?: never } | { since: Date; waitingBefore?: never };

/**
 * The items of one kind as office rules read them — the ONE place a kind's facts (workspace, minutes, days,
 * amount, cover) are worked out, so the sweep and the rules page cannot read a kind two ways.
 */
@Injectable()
export class RuleFactsReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async read(organizationId: string, kind: RuleKind, window: RuleItemWindow, needCover = false): Promise<RuleItem[]> {
    const created = window.since ? { gte: window.since } : { lte: window.waitingBefore };
    if (kind === 'hours') return hoursItems(this.prisma, organizationId, window);
    if (kind === 'noShow') return noShowItems(this.prisma, organizationId, window);
    if (kind === 'assetProposal') return proposalItems(this.prisma, this.moduleRef, organizationId, window);
    if (kind === 'clientRequest') return clientRequestItems(this.prisma, organizationId, window);
    if (kind === 'request') {
      const rows = await this.prisma.timeOff.findMany({
        where: {
          ...(window.since ? {} : { status: 'PENDING' as const }),
          createdAt: created,
          technician: { organizationId, isActive: true },
        },
        select: {
          id: true,
          createdAt: true,
          startDate: true,
          endDate: true,
          workingDays: true,
          kind: true,
          spaceId: true,
          technicianId: true,
          technician: { select: { firstName: true, lastName: true, spaceAssignments: { select: { spaceId: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_ITEMS,
      });
      const cover = needCover ? await this.coverShort(organizationId, rows) : new Map<string, boolean>();
      return rows.map((t) => ({
        itemId: t.id,
        since: t.createdAt,
        subjectId: t.technicianId,
        subjectName: personName(t.technician),
        facts: {
          spaceIds: t.spaceId ? [t.spaceId] : t.technician.spaceAssignments.map((a) => a.spaceId),
          days: t.workingDays ?? Math.round((t.endDate.getTime() - t.startDate.getTime()) / 86_400_000) + 1,
          coverShort: cover.get(t.id) ?? false,
        },
      }));
    }
    if (kind === 'expense') {
      const rows = await this.prisma.assetMoney.findMany({
        where: { organizationId, ...(window.since ? {} : { status: 'SUBMITTED' as const }), createdAt: created },
        select: { id: true, createdAt: true, amountCents: true, authorId: true, assetId: true },
        orderBy: { createdAt: 'desc' },
        take: MAX_ITEMS,
      });
      // The asset's workspace is its KIND's; the author is a plain id — both read in one query each.
      const [assets, authors] = await Promise.all([
        this.prisma.asset.findMany({
          where: { id: { in: [...new Set(rows.map((m) => m.assetId))] } },
          select: { id: true, category: { select: { spaceId: true } } },
        }),
        namesOf(this.prisma, rows.map((m) => m.authorId).filter(Boolean) as string[]),
      ]);
      const spaceOf = new Map(assets.map((a) => [a.id, a.category?.spaceId ?? null]));
      const nameOf = authors;
      return rows.map((m) => ({
        itemId: m.id,
        since: m.createdAt,
        subjectId: m.authorId,
        subjectName: m.authorId ? (nameOf.get(m.authorId) ?? '') : '',
        facts: { spaceIds: spaceOf.get(m.assetId) ? [spaceOf.get(m.assetId)!] : [], amountCents: m.amountCents },
      }));
    }
    // Overtime: the formal round waiting for a leader — keyed by its shift, like the second step.
    const rows = await this.prisma.overtimeRequest.findMany({
      where: window.since
        ? { organizationId, createdAt: { gte: window.since } }
        : {
            organizationId,
            status: 'PENDING_APPROVAL',
            OR: [
              { technicianRespondedAt: { lte: window.waitingBefore } },
              { technicianRespondedAt: null, createdAt: { lte: window.waitingBefore } },
            ],
          },
      select: {
        timeEntryId: true,
        createdAt: true,
        technicianRespondedAt: true,
        locationId: true,
        maxDurationMinutes: true,
        technicianId: true,
        technician: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ITEMS,
    });
    return rows.map((o) => ({
      itemId: o.timeEntryId,
      since: o.technicianRespondedAt ?? o.createdAt,
      subjectId: o.technicianId,
      subjectName: personName(o.technician),
      facts: { spaceIds: [o.locationId], minutes: o.maxDurationMinutes ?? null },
    }));
  }

  /** The wallchart's verdict for pending LEAVE, only when a rule asks about cover. */
  private async coverShort(
    organizationId: string,
    rows: Array<{ id: string; technicianId: string; startDate: Date; endDate: Date; kind: string }>,
  ): Promise<Map<string, boolean>> {
    const out = new Map<string, boolean>();
    try {
      // CoverService lives with the technicians; asked through the container, never imported into this module.
      const cover = this.moduleRef.get(CoverService, { strict: false });
      const leave = rows.filter((r) => r.kind === ABSENCE_WHERE.kind);
      const verdicts = await cover.assessMany(
        organizationId,
        leave.map((r) => ({ id: r.id, technicianId: r.technicianId, startDate: r.startDate, endDate: r.endDate })),
      );
      for (const [id, v] of verdicts)
        out.set(
          id,
          (v as { level?: string } | null)?.level === 'short' || (v as { level?: string } | null)?.level === 'skill',
        );
    } catch {
      // Unreadable cover: a cover-only rule does not fire, rather than firing on a guess.
    }
    return out;
  }
}
