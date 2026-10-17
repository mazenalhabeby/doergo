import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ShiftResolverService } from './shift-resolver.service';
import { notEndedWhere, zoneOf, success, SHIFT_REMINDER_DEFAULTS } from '@hbcfield/shared';
import { localPartsIn } from '@hbcfield/shared';

/** Writing the expected shifts (instances) for the days ahead, from the rota and the weekly schedule. */
@Injectable()
export class ShiftInstancesService {
  private readonly logger = new Logger(ShiftInstancesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftResolver: ShiftResolverService,
  ) {}


  // ──────────────────────────────────────────────────────────────────────────
  // NO-SHOW ENGINE (clock-in parity): materialize expected shifts → fulfill on
  // clock-in → sweep the unfulfilled ones (remind worker, escalate to a leader).
  // ──────────────────────────────────────────────────────────────────────────

  /** Local YYYY-MM-DD days (in tz) spanning [from, to] — a 2–3 element set. */
  private localDaysInWindow(from: Date, to: Date, tz: string): string[] {
    // The shared zoned-time reader (cached formatter, UTC on an unknown zone).
    const day = (t: Date) => localPartsIn(t, tz).dateStr;
    const days = new Set<string>();
    for (let t = from.getTime(); t <= to.getTime(); t += 6 * 3_600_000) days.add(day(new Date(t)));
    days.add(day(to));
    return [...days];
  }

  /**
   * Rolling materialization: ensure a ShiftInstance exists for every rota shift
   * in the next `windowHours`. Idempotent (upsert; never overwrites lifecycle
   * state). Physical spaces anchor to the site tz; logical to the member's tz
   * (falling back to org). Bounded scan over active assignments — no per-minute
   * cost (runs on a slow cron).
   */
  async materializeShiftInstances(windowHours = 36) {
    const now = new Date();
    const horizon = new Date(now.getTime() + windowHours * 3_600_000);

    // Collect every expected ShiftInstance, then bulk-insert. `skipDuplicates`
    // reproduces the old per-row upsert's `update: {}` semantics (insert new,
    // never clobber an existing instance's lifecycle/reminders) — but as chunked
    // createMany instead of up to ~15k serial upserts occupying the queue slot. (P5)
    const pending: Array<{
      organizationId: string;
      spaceId: string;
      userId: string;
      shiftId: string;
      localDate: string;
      expectedClockInAt: Date;
      expectedClockOutAt: Date;
      nextRemindAt: Date;
    }> = [];

    // Keyset-paginate ALL active assignments (cursor by id) instead of a silent
    // `take: 5000` cap that stopped materializing — and therefore stopped
    // detecting no-shows — for the tail beyond 5000 active rotas. (P4)
    const BATCH = 1000;
    let cursor: string | undefined;
    let processed = 0;
    for (;;) {
      const assignments = await this.prisma.shiftAssignment.findMany({
        where: {
          isActive: true,
          effectiveFrom: { lte: horizon },
          ...notEndedWhere(now),
        },
        include: {
          shift: true,
          space: { select: { id: true, organizationId: true, timezone: true, lat: true, lng: true } },
          user: { select: { id: true, timezone: true, organization: { select: { timezone: true } } } },
        },
        orderBy: { id: 'asc' },
        take: BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (assignments.length === 0) break;
      cursor = assignments[assignments.length - 1].id;
      processed += assignments.length;

      for (const a of assignments) {
        if (!a.shift?.isActive) continue;
        const physical = a.space.lat != null && a.space.lng != null;
        const tz = physical ? zoneOf(a.space.timezone) : zoneOf(a.user.timezone, a.user.organization?.timezone);
        for (const dateStr of this.localDaysInWindow(now, horizon, tz)) {
          const win = this.shiftResolver.matchAndWindowForDate(a as any, tz, dateStr);
          if (!win) continue;
          if (win.expectedClockOutAt.getTime() < now.getTime()) continue; // already over
          const graceMin = a.shift.graceMin ?? SHIFT_REMINDER_DEFAULTS.GRACE_MINUTES;
          pending.push({
            organizationId: a.space.organizationId,
            spaceId: a.spaceId,
            userId: a.userId,
            shiftId: a.shiftId,
            localDate: dateStr,
            expectedClockInAt: win.expectedClockInAt,
            expectedClockOutAt: win.expectedClockOutAt,
            nextRemindAt: new Date(win.expectedClockInAt.getTime() + graceMin * 60_000),
          });
        }
      }

      if (assignments.length < BATCH) break;
    }

    let created = 0;
    const CHUNK = 1000;
    for (let i = 0; i < pending.length; i += CHUNK) {
      const res = await this.prisma.shiftInstance.createMany({
        data: pending.slice(i, i + CHUNK),
        skipDuplicates: true,
      });
      created += res.count;
    }
    return success({ processed, created });
  }
}
