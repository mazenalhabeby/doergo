import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  personName,
  NO_SHOW_OPEN_STATES,
  isNoShowExcuseReason,
  isOpenNoShow,
  scopeWhereOn,
  success,
  type AttendanceScope,
  peopleFacesAndPresence,
} from '@hbcfield/shared';
import { assertNotSelfDecision } from '../core/self-decision';
import { DAY } from './no-show-record-helpers';
import { PrismaService, spaceIdsOf } from '@hbcfield/shared';
import { monthFacts, ruleRunsFor, runHints, runsFor, spaceRows } from './no-show-run-facts';
import { ApprovalRulesService } from '../../approvals/rules/approval-rules.service';
import { waitingReply } from '../../approvals/rules/rule-gate-types';

/**
 * The no-show RECORD and its decisions (shared attendance/no-show.ts):
 *
 *  - `list` — what the inbox and the home Crew card read. Open ones carry
 *    their RUN (the same person missing the same shift day after day is ONE
 *    item: only the newest is `runLatest`) and the facts a leader decides on.
 *  - `resolve` — excused (with what happened), absent, or reopened; for one
 *    day or the whole run, which the server finds itself — a client never
 *    names the rows a decision reaches.
 *  - `summary` — the Attendance → No-shows record, one row per person.
 */
@Injectable()
export class NoShowRecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: ApprovalRulesService,
  ) {}

  async list(data: {
    organizationId: string;
    days?: number;
    spaceId?: string;
    scopeSpaceIds?: AttendanceScope;
    open?: boolean;
  }) {
    const now = new Date();
    const since = new Date(now.getTime() - (data.days ?? 7) * DAY);
    const rows = await this.prisma.shiftInstance.findMany({
      where: {
        organizationId: data.organizationId,
        // ⚠️ BOTH, AND-ed — spreading the scope after `{ spaceId }` REPLACED the key.
        AND: [data.spaceId ? { spaceId: data.spaceId } : {}, scopeWhereOn('spaceId', data.scopeSpaceIds)],
        state: { in: data.open ? [...NO_SHOW_OPEN_STATES] : [...NO_SHOW_OPEN_STATES, 'EXCUSED', 'ABSENT'] },
        expectedClockInAt: { gte: since, lte: now },
      },
      orderBy: { expectedClockInAt: 'desc' },
      take: 300,
    });
    if (rows.length === 0) return success([]);

    const userIds = [...new Set(rows.map((r) => r.userId))];
    const openRows = rows.filter((r) => isOpenNoShow(r.state));
    const [users, spaces, runs, facts] = await Promise.all([
      peopleFacesAndPresence(this.prisma, userIds),
      spaceRows(
        this.prisma,
        data.organizationId,
        rows.flatMap((r) => [r.spaceId, r.settledSpaceId]),
      ),
      runsFor(this.prisma, openRows, now),
      monthFacts(this.prisma, openRows),
    ]);
    const uMap = new Map(users.map((u) => [u.id, u]));
    const hints = await runHints(this.prisma, openRows, runs, data.organizationId);

    return success(
      rows.map((r) => {
        const u = uMap.get(r.userId);
        const run = runs.get(r.id);
        return {
          id: r.id,
          userId: r.userId,
          userName: u ? personName(u) : 'Unknown',
          avatarUrl: u?.avatarUrl ?? null,
          spaceId: r.spaceId,
          spaceName: spaces.get(r.spaceId)?.name ?? 'Space',
          timezone: spaces.get(r.spaceId)?.timezone ?? null,
          expectedClockInAt: r.expectedClockInAt,
          expectedClockOutAt: r.expectedClockOutAt,
          state: r.state,
          reminderCount: r.reminderCount,
          localDate: r.localDate,
          excuseReason: r.excuseReason ?? null,
          closeReason: r.closeReason ?? null,
          closedAutomatically: r.closedAutomatically,
          settledSpaceName: r.settledSpaceId ? (spaces.get(r.settledSpaceId)?.name ?? null) : null,
          ...(isOpenNoShow(r.state)
            ? {
                lastActiveAt: u?.lastActiveAt ?? null,
                missedThisMonth: facts.get(`${r.userId}|${r.localDate.slice(0, 7)}`) ?? 1,
                run: run && run.count > 1 ? { count: run.count, from: run.from, to: run.to } : null,
                // The inbox shows one item per run: the newest.
                runLatest: !run || run.latestId === r.id,
                hint: run && run.count > 1 ? (hints.get(run.latestId) ?? null) : null,
              }
            : {}),
        };
      }),
    );
  }

  async resolve(data: {
    id: string;
    organizationId: string;
    action: 'excuse' | 'absent' | 'reopen';
    reasonCode?: string;
    reason?: string;
    wholeRun?: boolean;
    excusedById?: string;
    scopeSpaceIds?: AttendanceScope;
  }) {
    const inst = await this.prisma.shiftInstance.findFirst({
      // A no-show in a space the caller was not granted reads as 'not found'.
      where: { id: data.id, organizationId: data.organizationId, ...scopeWhereOn('spaceId', data.scopeSpaceIds) },
    });
    if (!inst) throw new NotFoundException('No-show not found');
    await assertNotSelfDecision(this.prisma, {
      deciderId: data.excusedById,
      subjectId: inst.userId,
      organizationId: data.organizationId,
      message: 'You cannot decide your own missed shift. Ask a manager or an administrator.',
    });

    if (data.action === 'reopen') {
      if (inst.state !== 'EXCUSED' && inst.state !== 'ABSENT')
        throw new BadRequestException({
          code: 'NO_SHOW_NOT_DECIDED',
          message: 'Only a decided no-show can be reopened.',
        });
      // Back to waiting for a decision — never back to nudging the person about an old day.
      const updated = await this.prisma.shiftInstance.update({
        where: { id: inst.id },
        data: {
          state: 'ESCALATED',
          nextRemindAt: null,
          excuseReason: null,
          excusedById: null,
          closeReason: null,
          closedAutomatically: false,
          decidedAt: null,
          settledSpaceId: null,
        },
      });
      return success(updated);
    }

    if (!isOpenNoShow(inst.state))
      throw new BadRequestException({ code: 'NO_SHOW_ALREADY_DECIDED', message: 'This no-show was already decided.' });
    const run = (await runsFor(this.prisma, [inst], new Date())).get(inst.id);
    const ids = data.wholeRun ? (run?.ids ?? [inst.id]) : [inst.id];
    const now = new Date();
    const excuse = data.action === 'excuse';
    /*
      Office rules: excusing a long run of missed days may need more people; marking absent ends it. The step
      belongs to the RUN — kept under its newest day (the inbox item), found from any of its days — and it is judged
      on the WHOLE run, whether this decision closes all of it or one day: a five-day run excused one day at a time
      is still five days in a row.
    */
    const runIds = run?.ids ?? [inst.id];
    // …and with the days a person already answered: answering one day "absent" never splits the run (ruleRunsFor).
    const ruleDays = (await ruleRunsFor(this.prisma, [inst], now)).get(inst.id)?.count ?? run?.count ?? 1;
    const close = () =>
      this.prisma.shiftInstance.updateMany({
        // Only the ones still open — a day closed meanwhile keeps its own answer.
        where: { id: { in: ids }, state: { in: [...NO_SHOW_OPEN_STATES] } },
        data: {
          state: excuse ? 'EXCUSED' : 'ABSENT',
          nextRemindAt: null,
          closeReason: excuse ? (isNoShowExcuseReason(data.reasonCode) ? data.reasonCode : 'OTHER') : null,
          closedAutomatically: false,
          excuseReason: data.reason?.trim().slice(0, 500) || null,
          excusedById: data.excusedById ?? null,
          decidedAt: now,
        },
      });
    if (!excuse) {
      await this.rules.clear(data.organizationId, 'noShow', runIds);
      const res = await close();
      return success({ id: inst.id, state: 'ABSENT', decided: res.count });
    }
    // Excusing is a decision by somebody: never judged as nobody (the gateway always says who).
    if (!data.excusedById)
      throw new BadRequestException({ code: 'NO_SHOW_DECIDER_REQUIRED', message: 'Who decided is missing.' });
    const decided = await this.rules.decide(
      {
        organizationId: data.organizationId,
        kind: 'noShow',
        itemId: run?.latestId ?? inst.id,
        itemAliases: runIds,
        facts: { spaceIds: spaceIdsOf(inst.spaceId), days: ruleDays },
        deciderId: data.excusedById,
        subjectId: inst.userId,
      },
      close,
    );
    if (decided.waiting) return waitingReply({ id: inst.id, state: inst.state, decided: 0 }, decided.waiting);
    const res = decided.done;
    return success({ id: inst.id, state: 'EXCUSED', decided: res.count });
  }
}
