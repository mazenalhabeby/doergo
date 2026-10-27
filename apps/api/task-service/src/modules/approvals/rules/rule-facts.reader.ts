import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { personName, type RuleKind } from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
export type { RuleItem, RuleItemWindow } from './rule-items';
import { CoverService } from '../../technicians/cover.service';
import { OutsideShiftService } from '../../attendance/extra-time/outside-shift.service';
import { approvedOvertimeByEntry, overtimeRuleFacts } from '../../attendance/extra-time/overtime-rule-facts';
import { REQUEST_RULE_SELECT, requestRuleFacts, requestsCoverShort } from './request-rule-facts';
import { inSpaces, type RuleItem, type RuleItemWindow } from './rule-items';
import { MAX_ITEMS, clientRequestItems, hoursItems, peopleNameMap, noShowItems, proposalItems } from './rule-facts-kinds';

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
          ...(window.spaceIds
            ? {
                OR: [
                  { spaceId: { in: window.spaceIds } },
                  { spaceId: null, technician: { spaceAssignments: { some: { spaceId: { in: window.spaceIds } } } } },
                ],
              }
            : {}),
        },
        select: {
          ...REQUEST_RULE_SELECT,
          createdAt: true,
          technician: { select: { firstName: true, lastName: true, ...REQUEST_RULE_SELECT.technician.select } },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_ITEMS,
      });
      // CoverService lives with the technicians; asked through the container, never imported into this module.
      const cover = needCover
        ? await requestsCoverShort(this.moduleRef.get(CoverService, { strict: false }), organizationId, rows)
        : new Map<string, boolean>();
      return rows.map((t) => ({
        itemId: t.id,
        since: t.createdAt,
        subjectId: t.technicianId,
        subjectName: personName(t.technician),
        facts: requestRuleFacts(t, cover.get(t.id) ?? false),
      }));
    }
    if (kind === 'expense') {
      const rows = await this.prisma.assetMoney.findMany({
        where: {
          organizationId,
          ...(window.since ? {} : { status: 'SUBMITTED' as const }),
          createdAt: created,
          ...(window.spaceIds ? { asset: { category: { spaceId: { in: window.spaceIds } } } } : {}),
        },
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
        peopleNameMap(this.prisma, rows.map((m) => m.authorId).filter(Boolean) as string[]),
      ]);
      const spaceOf = new Map(assets.map((a) => [a.id, a.category?.spaceId ?? null]));
      return rows.map((m) => ({
        itemId: m.id,
        since: m.createdAt,
        subjectId: m.authorId,
        subjectName: m.authorId ? (authors.get(m.authorId) ?? '') : '',
        facts: { spaceIds: spaceOf.get(m.assetId) ? [spaceOf.get(m.assetId)!] : [], amountCents: m.amountCents },
      }));
    }
    // Overtime: the formal round waiting for a leader — keyed by its shift, like the second step.
    const rows = await this.prisma.overtimeRequest.findMany({
      where: window.since
        ? { organizationId, createdAt: { gte: window.since }, ...inSpaces(window, 'locationId') }
        : {
            organizationId,
            ...inSpaces(window, 'locationId'),
            status: 'PENDING_APPROVAL',
            OR: [
              { technicianRespondedAt: { lte: window.waitingBefore } },
              { technicianRespondedAt: null, createdAt: { lte: window.waitingBefore } },
            ],
          },
      select: {
        timeEntryId: true,
        status: true,
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
    // …and time worked outside the shift, counted as overtime under its own step (the attendance module owns it).
    const outside = await this.moduleRef
      .get(OutsideShiftService, { strict: false })
      .ruleItems(organizationId, window, MAX_ITEMS);
    // Judged as the gate judges it: the shift's whole overtime (the rounds approved on it, never this one twice).
    const approved = await approvedOvertimeByEntry(this.prisma, [...new Set(rows.map((o) => o.timeEntryId))]);
    return [
      ...rows.map((o) => {
        const round = o.maxDurationMinutes ?? 0;
        const before = (approved.get(o.timeEntryId) ?? 0) - (o.status === 'APPROVED' ? round : 0);
        return {
          itemId: o.timeEntryId,
          since: o.technicianRespondedAt ?? o.createdAt,
          subjectId: o.technicianId,
          subjectName: personName(o.technician),
          facts: overtimeRuleFacts(o.locationId, round, Math.max(0, before)),
        };
      }),
      ...outside.map((o) => ({
        itemId: o.itemId,
        since: o.since,
        subjectId: o.subjectId,
        subjectName: personName(o.user),
        facts: { spaceIds: [o.spaceId], minutes: o.minutes },
      })),
    ];
  }
}
