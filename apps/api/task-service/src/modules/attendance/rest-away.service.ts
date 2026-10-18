import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { judgedByLabelRules, parseBreakPlan, plannedRestForTap, SERVICE_NAMES } from '@hbcfield/shared';
import { emitEvent, attendanceRestStartedEvent } from '@hbcfield/shared/microservices';
import type { Prisma } from '@prisma/client';
import { BreakService } from './break.service';

/** The reason a rest started by leaving the site carries — its words come from the label catalogue. */
export const LEFT_FOR_REST_REASON = 'AUTO_REST';

/** What the ring logic knows about the running shift; the open rest rides on the same read. */
export interface RestAwayEntry {
  id: string;
  userId: string;
  organizationId: string;
  labelRules?: number | null;
  breakPlan?: Prisma.JsonValue | null;
  location?: { name?: string | null } | null;
  /** The rest running now, if any (at most one). */
  breaks?: ReadonlyArray<{ id: string; reason?: string | null }>;
}

/**
 * Lunch off site is the rest (decided 2026-10-18, docs/plans/clock-attendance-2026-10.md).
 *
 * Leaving the site INSIDE a planned rest's window starts that rest — no "you left the
 * work area", no reason, no approval; coming back ends it, and the step-2 rest rule
 * judges it (LATE_FROM_REST when it ran over). Outside a rest window the excursion
 * flow is unchanged. New entries only (`labelRules` set): the past is not touched.
 *
 * The rest is started and ended through BreakService — the same path as the Break
 * button — so the plan, counted time, the live events and the labels move exactly
 * as they would for a tap.
 */
@Injectable()
export class RestAwayService {
  private readonly logger = new Logger(RestAwayService.name);

  constructor(
    private readonly breaks: BreakService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
  ) {}

  /**
   * They left the site at `at`. `isRest` → that is a rest (started now, or one already
   * running) and the caller opens no excursion; otherwise the ordinary excursion flow.
   * `startedBreakId` names a rest started by this call (a replayed batch ends it itself).
   */
  async onLeftSite(entry: RestAwayEntry, at: Date): Promise<{ isRest: boolean; startedBreakId: string | null }> {
    const no = { isRest: false, startedBreakId: null };
    if (!judgedByLabelRules(entry)) return no;
    // Already resting (they tapped Break first): leaving is part of that rest.
    if (entry.breaks && entry.breaks.length > 0) return { isRest: true, startedBreakId: null };
    const planned = plannedRestForTap(parseBreakPlan(entry.breakPlan), { at });
    if (!planned) return no;
    let startedBreakId: string | null = null;
    try {
      const started = await this.breaks.startBreak({
        userId: entry.userId,
        organizationId: entry.organizationId,
        entryId: entry.id,
        ruleId: planned.ruleId,
        type: planned.durationMinutes >= 30 ? 'LUNCH' : 'SHORT',
        reason: LEFT_FOR_REST_REASON,
        evidence: { occurredAt: at.toISOString() },
      });
      startedBreakId = (started.data as { id?: string } | undefined)?.id ?? null;
    } catch (err) {
      // A rest that cannot start (a race with a tap) leaves the excursion flow in charge.
      this.logger.warn(`rest on leaving not started for entry=${entry.id}: ${err}`);
      return no;
    }
    emitEvent(this.notificationClient, attendanceRestStartedEvent, {
      entryId: entry.id,
      userId: entry.userId,
      organizationId: entry.organizationId,
      restName: planned.name,
      plannedMinutes: planned.durationMinutes,
      isPaid: planned.isPaid,
      startedAt: at.toISOString(),
      locationName: entry.location?.name ?? null,
    });
    return { isRest: true, startedBreakId };
  }

  /** Back on site at `at`: a rest that started by leaving ends now. True when one did. */
  async onBackOnSite(entry: RestAwayEntry, at: Date): Promise<boolean> {
    if (!judgedByLabelRules(entry)) return false;
    const running = entry.breaks?.find((b) => b.reason === LEFT_FOR_REST_REASON);
    return running ? this.endRest(entry, running.id, at) : false;
  }

  /** End a rest that started by leaving, at the moment they came back. */
  async endRest(entry: RestAwayEntry, breakId: string, at: Date): Promise<boolean> {
    try {
      await this.breaks.endBreak({
        userId: entry.userId,
        organizationId: entry.organizationId,
        breakId,
        evidence: { occurredAt: at.toISOString() },
      });
      return true;
    } catch (err) {
      this.logger.warn(`rest on return not ended for entry=${entry.id}: ${err}`);
      return false;
    }
  }
}
