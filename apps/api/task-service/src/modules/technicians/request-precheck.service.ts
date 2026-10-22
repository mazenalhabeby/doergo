import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  zoneOf,
  DAILY_WORK_GUIDE_MINUTES,
  isAbsence,
  parseRequestInput,
  toISODateString,
  type RequestPrecheck,
  personActiveSpaces,
  activeWindowWhere,
} from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { ApprovalRulesService } from '../approvals/rules/approval-rules.service';
import { ShiftResolverService } from '../attendance/core/shift-resolver.service';
import { CoverService } from './cover.service';
import { LeaveLedgerService } from './leave-ledger.service';
import { TechniciansService } from './technicians.service';
import { REQUEST_REFUSALS } from './technicians-helpers';

/**
 * THE PRE-CHECK — what a leader would check, answered for the member before
 * they send (shared `request-precheck.ts`). The body is read by the SAME
 * parser as sending (`parseRequestInput`) and every answer is an existing
 * reader: the overlap rule, the working-day count, the leave ledger, the
 * wallchart's cover verdict, the planned shift, the office rules.
 *
 * ⚠️ Only the caller's OWN request (the id comes from the token). Cover is a
 * LEVEL — never who is off. Advice only; sending still runs every rule.
 */
@Injectable()
export class RequestPrecheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly technicians: TechniciansService,
    private readonly cover: CoverService,
    private readonly ledger: LeaveLedgerService,
    private readonly moduleRef: ModuleRef,
    @Optional() private readonly rules?: ApprovalRulesService,
  ) {}

  async precheck(data: { userId: string; organizationId: string; body: unknown }): Promise<RequestPrecheck> {
    const parsed = parseRequestInput(data.body);
    if (!parsed.ok) throw new BadRequestException({ code: parsed.code, message: REQUEST_REFUSALS[parsed.code] });
    const value = parsed.value;
    const start = new Date(value.startDate);
    const end = new Date(value.endDate);
    const leave = isAbsence(value.kind);

    const [clashes, member] = await Promise.all([
      this.technicians.requestClashes(data.userId, value.kind, start, end),
      personActiveSpaces(this.prisma, data.userId, data.organizationId),
    ]);
    const spaceIds = value.spaceId ? [value.spaceId] : (member?.spaceAssignments ?? []).map((a) => a.spaceId);

    let workingDays: number | null = null;
    let balance: RequestPrecheck['balance'] = null;
    let cover: RequestPrecheck['cover'] = null;
    if (leave) {
      workingDays = await this.technicians
        .countWorkingDays(data.organizationId, data.userId, start, end)
        .catch(() => null);
      if ((value.type ?? 'VACATION') === 'VACATION' && workingDays != null) {
        const b = await this.ledger
          .getBalance({ technicianId: data.userId, organizationId: data.organizationId, on: value.startDate })
          .catch(() => null);
        if (b) balance = { before: b.remaining, after: b.remaining - workingDays };
      }
      const verdict = (
        await this.cover
          .assessMany(data.organizationId, [
            { id: 'precheck', technicianId: data.userId, startDate: start, endDate: end },
          ])
          .catch(() => null)
      )?.get('precheck');
      cover = (verdict?.level as RequestPrecheck['cover']) ?? null;
    }

    let dailyLimit: RequestPrecheck['dailyLimit'] = null;
    if (value.kind === 'OVERTIME' && value.minutes) {
      const planned = await this.plannedMinutes(data.userId, data.organizationId, value.startDate);
      dailyLimit = {
        plannedMinutes: planned,
        requestedMinutes: value.minutes,
        limitMinutes: DAILY_WORK_GUIDE_MINUTES,
        over: planned + value.minutes > DAILY_WORK_GUIDE_MINUTES,
      };
    }

    const ruleKind = value.kind === 'OVERTIME' ? 'overtime' : 'request';
    const secondApproval = this.rules
      ? await this.rules
          .secondStepFor(data.organizationId, ruleKind, {
            spaceIds,
            days: workingDays ?? undefined,
            minutes: value.minutes ?? undefined,
            coverShort: cover === 'short' || cover === 'skill',
          })
          .catch(() => null)
      : null;

    return {
      workingDays,
      balance,
      clashes: clashes.map((c) => ({
        kind: c.kind,
        startDate: toISODateString(c.startDate),
        endDate: toISODateString(c.endDate),
        status: c.status,
      })),
      cover,
      dailyLimit,
      secondApproval,
    };
  }

  /** The member's planned time on that day, from the rota (the same resolver as the automatic clock). */
  private async plannedMinutes(userId: string, organizationId: string, day: string): Promise<number> {
    try {
      const resolver = this.moduleRef.get(ShiftResolverService, { strict: false });
      const now = new Date();
      const places = await this.prisma.spaceAssignment.findMany({
        where: { userId, organizationId, ...activeWindowWhere(now) },
        select: { space: { select: { id: true, timezone: true, workModel: true, lat: true, lng: true } } },
      });
      const spaces = places.map((p) => ({
        id: p.space.id,
        timezone: zoneOf(p.space.timezone),
        workModel: p.space.workModel,
        lat: p.space.lat,
        lng: p.space.lng,
      }));
      const windows = await resolver.plannedWindows(userId, spaces as never, () => [day]);
      let minutes = 0;
      for (const list of windows.values()) {
        for (const w of list)
          if (w.dateStr === day)
            minutes += Math.round((w.expectedClockOutAt.getTime() - w.expectedClockInAt.getTime()) / 60_000);
      }
      return minutes;
    } catch {
      return 0;
    }
  }
}
