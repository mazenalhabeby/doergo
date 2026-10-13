import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  AUTO_CLOCK_IN_FLAG,
  AUTO_REST_FLAG,
  SERVICE_NAMES,
  SHIFT_REMINDER_DEFAULTS,
  TimeEntryStatus,
  activeAssignmentWhere,
  addDaysStr,
  autoClockActive,
  autoClockOffered,
  autoClockUndoDeadline,
  autoRestPlan,
  geofenceArmRadius,
  localPartsIn,
  readAutoClockSettings,
  parseGeofencePolygon,
  spaceRunsClock,
  success,
  zonedWallTimeToUtc,
  type AutoClockPlace,
  type AutoClockPlan,
  type AutoClockSettings,
  type OccurrenceEvidence,
} from '@hbcfield/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { judgeOccurrence } from '../../common/occurrence.util';
import { ShiftResolverService } from './shift-resolver.service';
import { approvedRequestsAround, dayRequestEffect, type DayRequestRow } from './approved-requests';

/** The audit row an undo leaves — the only trace once the entry is gone, and what makes a replayed undo answer "done". */
export const AUTO_UNDO_EVENT = 'TIME_ENTRY_AUTO_UNDONE';

/** Steps that mean work was recorded during an automatic clock-in — after them it cannot be undone. */
const WORK_EVENTS = ['STATUS_CHANGED', 'CREW_JOINED', 'RESUMED', 'SELF_RESUMED', 'TAKEN'] as const;

/** The minimum the entries a sweep holds must carry to be asked "is this an automatic member?". */
interface EntryRef {
  id: string;
  userId: string;
  locationId: string;
  clockInAt: Date;
}

/**
 * The automatic clock's server half (shared attendance/auto-clock.ts).
 *
 * The phone decides arrival and departure OFFLINE and files the step in its
 * outbox; everything it sends is re-checked here and by the ordinary clock-in /
 * clock-out, which run exactly as for a tap. This service answers the three
 * questions only the automatic clock asks: where to arm (the plan), may the
 * owner take it back (undo), and is this member automatic at all — for one
 * entry, or for a sweep's whole batch in one query.
 *
 * ⚠️ ON = workspace settings enabled ∧ the member chosen there ∧ the member's
 * own consent (`autoClockActive`). Any one missing and the step is an ordinary
 * one — never refused, never marked.
 */
@Injectable()
export class AutoClockService {
  private readonly logger = new Logger(AutoClockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftResolver: ShiftResolverService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
  ) {}

  // ── Is this member automatic? ───────────────────────────────────────────

  /** The settings in force for this member at this workspace at `at`, or null when the automatic clock is not on for them. One query. */
  async settingsFor(userId: string, spaceId: string, at: Date): Promise<AutoClockSettings | null> {
    const row = await this.prisma.spaceAssignment.findFirst({
      where: { ...activeAssignmentWhere(userId, at), spaceId, autoClock: true },
      select: {
        autoClock: true,
        space: { select: { autoClock: true, isRemote: true } },
        user: { select: { autoClockConsentAt: true, isExternal: true } },
      },
    });
    if (!row || row.space.isRemote) return null;
    return autoClockActive({
      consentAt: row.user.autoClockConsentAt,
      settings: row.space.autoClock,
      assignmentAutoClock: row.autoClock,
      isExternal: row.user.isExternal,
    });
  }

  /**
   * The same answer for a sweep's whole batch — ONE query whatever its size.
   * Keyed by entry id; an entry absent from the map is not automatic.
   */
  async settingsForEntries(entries: readonly EntryRef[], at: Date = new Date()): Promise<Map<string, AutoClockSettings>> {
    const out = new Map<string, AutoClockSettings>();
    if (!entries.length) return out;
    const userIds = [...new Set(entries.map((e) => e.userId))];
    const spaceIds = [...new Set(entries.map((e) => e.locationId))];
    const rows = await this.prisma.spaceAssignment.findMany({
      where: {
        userId: { in: userIds },
        spaceId: { in: spaceIds },
        autoClock: true,
        // Assigned at the shift's clock-in: a member removed mid-shift still had it.
        effectiveFrom: { lte: at },
        space: { autoClock: { not: Prisma.DbNull }, isRemote: false },
      },
      select: {
        userId: true,
        spaceId: true,
        autoClock: true,
        effectiveTo: true,
        effectiveFrom: true,
        space: { select: { autoClock: true } },
        user: { select: { autoClockConsentAt: true, isExternal: true } },
      },
    });
    for (const e of entries) {
      const row = rows.find(
        (r) =>
          r.userId === e.userId &&
          r.spaceId === e.locationId &&
          r.effectiveFrom <= e.clockInAt &&
          (!r.effectiveTo || r.effectiveTo >= e.clockInAt),
      );
      if (!row) continue;
      const s = autoClockActive({
        consentAt: row.user.autoClockConsentAt,
        settings: row.space.autoClock,
        assignmentAutoClock: row.autoClock,
        isExternal: row.user.isExternal,
      });
      if (s) out.set(e.id, s);
    }
    return out;
  }

  // ── The rest at the close ───────────────────────────────────────────────

  /**
   * The automatic rest to insert as a shift closes, or null.
   *
   * Only when cheap to rule out first (no rest of any kind recorded, not
   * skipped, not already applied, a planned shift longer than six hours) — so
   * the one query below runs for a small minority of closes. The rest is the
   * shared `autoRestPlan` (centred in the PLANNED shift), clamped inside the
   * entry as it actually ran; nothing is inserted when it no longer fits.
   */
  async autoRestAtClose(
    entry: EntryRef & {
      expectedClockInAt?: Date | null;
      expectedClockOutAt?: Date | null;
      autoRestSkippedAt?: Date | null;
      flagReasons?: string[] | null;
      breaks?: unknown[];
    },
    closeAt: Date,
  ): Promise<{ startedAt: Date; endedAt: Date; minutes: number } | null> {
    // Rests unknown (a caller that did not read them) is never "none taken".
    if (!entry.breaks || entry.breaks.length > 0 || entry.autoRestSkippedAt) return null;
    if ((entry.flagReasons ?? []).includes(AUTO_REST_FLAG)) return null;
    if (!entry.expectedClockInAt || !entry.expectedClockOutAt || !entry.locationId) return null;
    if ((entry.expectedClockOutAt.getTime() - entry.expectedClockInAt.getTime()) / 60_000 <= 360) return null;
    const settings = await this.settingsFor(entry.userId, entry.locationId, entry.clockInAt);
    if (!settings) return null;
    const planned = autoRestPlan({
      settings,
      shiftStart: entry.expectedClockInAt,
      shiftEnd: entry.expectedClockOutAt,
      restTaken: false,
    });
    if (!planned) return null;
    const startedAt = new Date(Math.max(planned.startAt.getTime(), entry.clockInAt.getTime()));
    const endedAt = new Date(Math.min(planned.endAt.getTime(), closeAt.getTime()));
    const minutes = Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000);
    return minutes > 0 ? { startedAt, endedAt, minutes } : null;
  }

  // ── Consent ─────────────────────────────────────────────────────────────

  /** The member's own consent (ArbVG §96). Giving it twice keeps the first date; withdrawing clears it and the phone disarms. */
  async setConsent(data: { userId: string; organizationId: string; consent: boolean }) {
    const user = await this.prisma.user.findFirst({
      where: { id: data.userId, organizationId: data.organizationId },
      select: { id: true, autoClockConsentAt: true, isExternal: true },
    });
    if (!user) throw new NotFoundException('Member not found');
    if (data.consent && user.isExternal) {
      // An external member holds no clock — there is nothing to consent to.
      throw new BadRequestException({ message: 'External members do not use the clock', code: 'AUTO_CLOCK_NOT_FOR_EXTERNAL' });
    }
    const consentAt = data.consent ? (user.autoClockConsentAt ?? new Date()) : null;
    if ((consentAt?.getTime() ?? null) !== (user.autoClockConsentAt?.getTime() ?? null)) {
      await this.prisma.user.update({ where: { id: user.id }, data: { autoClockConsentAt: consentAt } });
    }
    return success({ consentAt: consentAt ? consentAt.toISOString() : null });
  }

  // ── The plan the phone arms from ────────────────────────────────────────

  /**
   * Where the phone arms geofences for the CALLER: every workspace where the
   * automatic clock is on for them (assignment active now or tomorrow), with a
   * pin, not the Remote bucket, running Time Tracking — and the planned shifts
   * yesterday (a night still running), today and tomorrow in its zone, after
   * approved requests.
   *
   * ⚠️ No consent → no places. The settings of a workspace are not the
   * member's to read before they have agreed to be clocked by it. What they DO
   * get is `offered` — how many workspaces chose them — so the phone offers the
   * switch only where agreeing would change something.
   *
   * A FIXED number of queries whatever the number of workspaces: the member,
   * their assignments, the workspaces, the rota + legacy schedule (two, in
   * `plannedWindows`) and the approved requests (two windows).
   */
  async plan(data: { userId: string; organizationId: string; now?: Date }) {
    const now = data.now ?? new Date();
    const generatedAt = now.toISOString();
    const user = await this.prisma.user.findFirst({
      where: { id: data.userId, organizationId: data.organizationId },
      select: { autoClockConsentAt: true, isExternal: true },
    });
    const consentAt = user?.autoClockConsentAt ?? null;
    const consentIso = consentAt ? consentAt.toISOString() : null;
    if (!user || user.isExternal) return success({ consentAt: consentIso, places: [], generatedAt, offered: 0, offeredIn: [] });

    const tomorrow = new Date(now.getTime() + 86_400_000);
    const assignments = await this.prisma.spaceAssignment.findMany({
      where: {
        autoClock: true,
        OR: [activeAssignmentWhere(data.userId, now), activeAssignmentWhere(data.userId, tomorrow)],
      },
      select: { spaceId: true, autoClock: true },
    });
    const spaceIds = [...new Set(assignments.map((a) => a.spaceId))];
    if (!spaceIds.length) return success({ consentAt: consentIso, places: [], generatedAt, offered: 0, offeredIn: [] });

    const locations = await this.prisma.companyLocation.findMany({
      where: {
        id: { in: spaceIds },
        organizationId: data.organizationId,
        isActive: true,
        isRemote: false,
        lat: { not: null },
        lng: { not: null },
        autoClock: { not: Prisma.DbNull },
      },
      select: {
        id: true, name: true, lat: true, lng: true, geofenceRadius: true, geofencePolygon: true,
        timezone: true, workModel: true, autoClock: true, enabledModules: true,
        organization: { select: { enabledModules: true } },
      },
      orderBy: { name: 'asc' },
    });
    // Where the OFFICE has chosen them (consent aside) — what decides whether the
    // phone offers the switch at all. A count only: nothing of a workspace's
    // settings reaches a member who has not agreed.
    const chosen = locations
      .map((l) => ({ l, settings: autoClockOffered({ settings: l.autoClock, assignmentAutoClock: true, isExternal: user.isExternal }) }))
      // The clock-in refuses where Time Tracking is off — never arm a site that cannot clock.
      .filter((x): x is { l: (typeof locations)[number]; settings: AutoClockSettings } =>
        !!x.settings && spaceRunsClock(x.l.enabledModules as string[] | null, x.l.organization?.enabledModules as string[] | null),
      );
    const offered = chosen.length;
    const offeredIn = chosen.map((x) => x.l.name);
    // ⚠️ No consent → no places.
    const active = consentAt ? chosen : [];
    if (!active.length) return success({ consentAt: consentIso, places: [], generatedAt, offered, offeredIn });

    const daysOf = (tz: string) => {
      const today = localPartsIn(now, tz).dateStr;
      return [addDaysStr(today, -1), today, addDaysStr(today, 1)];
    };
    const spaces = active.map(({ l }) => ({ id: l.id, timezone: l.timezone || 'UTC', workModel: l.workModel, lat: l.lat, lng: l.lng }));
    const [windows, requestsToday, requestsTomorrow] = await Promise.all([
      this.shiftResolver.plannedWindows(data.userId, spaces, (s) => daysOf(s.timezone)),
      approvedRequestsAround(this.prisma, data.userId, now),
      approvedRequestsAround(this.prisma, data.userId, tomorrow),
    ]);
    const requests = dedupeById([...requestsToday, ...requestsTomorrow]);

    const places: AutoClockPlace[] = active.map(({ l, settings }) => {
      const tz = l.timezone || 'UTC';
      const byDay = new Map((windows.get(l.id) ?? []).map((w) => [w.dateStr, w]));
      const shifts: Array<{ start: string; end: string }> = [];
      for (const dateStr of daysOf(tz)) {
        const w = byDay.get(dateStr);
        // Changed hours / agreed overtime move the day exactly as at clock-in (the shared rule).
        const effect = dayRequestEffect(requests, {
          spaceId: l.id,
          at: zonedWallTimeToUtc(dateStr, 12, 0, tz),
          tz,
          expectedClockInAt: w?.expectedClockInAt ?? null,
          expectedClockOutAt: w?.expectedClockOutAt ?? null,
        });
        const start = effect.expectedClockInAt ?? w?.expectedClockInAt ?? null;
        const end = effect.expectedClockOutAt ?? w?.expectedClockOutAt ?? null;
        if (!start || !end || end.getTime() <= now.getTime() || end <= start) continue;
        shifts.push({ start: start.toISOString(), end: end.toISOString() });
      }
      const polygon = parseGeofencePolygon(l.geofencePolygon);
      return {
        spaceId: l.id,
        name: l.name,
        lat: l.lat!,
        lng: l.lng!,
        radius: geofenceArmRadius({ lat: l.lat, lng: l.lng, geofenceRadius: l.geofenceRadius, geofencePolygon: polygon }),
        polygon,
        settings,
        shifts,
      };
    });
    return success({ consentAt: consentIso, places, generatedAt, offered, offeredIn });
  }

  // ── Undo a drive-past ───────────────────────────────────────────────────

  /** Was this id an automatic clock-in its owner undid? A resend of it must not make the shift again. */
  async wasUndone(entryId: string, userId: string): Promise<boolean> {
    const row = await this.prisma.activityLog.findFirst({
      where: { resourceId: entryId, eventType: AUTO_UNDO_EVENT, userId },
      select: { id: true },
    });
    return !!row;
  }

  /**
   * Take back an automatic clock-in — a drive-past, not an arrival.
   *
   * Own entry only (anybody else's is 404, like a missing one), still open, made
   * by the automatic clock, nothing recorded on it (no rest, no work-log, no job
   * moved or joined since), and within `autoClockUndoDeadline` of the clock-in,
   * judged at the moment of the TAP so an undo made offline counts when it was
   * made. The entry is REMOVED — it never happened — the way an office delete
   * removes one, and an audit row is the record that it existed. A replay of the
   * same undo finds that row and answers done.
   */
  async undo(data: { userId: string; organizationId: string; entryId: string; evidence?: OccurrenceEvidence }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id: data.entryId, userId: data.userId, organizationId: data.organizationId },
      select: {
        id: true, userId: true, locationId: true, status: true, clockInAt: true, clockOutAt: true,
        flagReasons: true, shiftId: true,
        location: { select: { autoClock: true } },
        _count: { select: { breaks: true, workLog: true } },
      },
    });
    if (!entry) {
      if (await this.wasUndone(data.entryId, data.userId)) return success({ undone: true as const }, 'Already undone');
      throw new NotFoundException('Time entry not found');
    }
    const refuse = (why: string) =>
      new BadRequestException({ message: `This clock-in can no longer be undone: ${why}`, code: 'AUTO_CLOCK_UNDO_NOT_ALLOWED', params: { why } });

    if (!(entry.flagReasons ?? []).includes(AUTO_CLOCK_IN_FLAG)) throw refuse('NOT_AUTOMATIC');
    if (entry.status !== TimeEntryStatus.CLOCKED_IN || entry.clockOutAt) throw refuse('CLOSED');
    if (entry._count.breaks > 0 || entry._count.workLog > 0) throw refuse('WORK_RECORDED');

    const at = judgeOccurrence(data.evidence, entry.clockInAt).at;
    const settings = readAutoClockSettings(entry.location?.autoClock);
    if (at.getTime() > autoClockUndoDeadline(entry.clockInAt, settings).getTime()) throw refuse('TOO_LATE');

    const worked = await this.prisma.taskEvent.findFirst({
      where: { userId: data.userId, createdAt: { gte: entry.clockInAt }, eventType: { in: [...WORK_EVENTS] as never } },
      select: { id: true },
    });
    if (worked) throw refuse('WORK_RECORDED');

    await this.prisma.$transaction(async (tx) => {
      // The expected shift it fulfilled is expected again — the person may still arrive.
      const instances = await tx.shiftInstance.findMany({
        where: { timeEntryId: entry.id },
        select: { id: true, expectedClockInAt: true },
      });
      for (const inst of instances) {
        const due = Math.max(Date.now(), inst.expectedClockInAt.getTime() + SHIFT_REMINDER_DEFAULTS.GRACE_MINUTES * 60_000);
        await tx.shiftInstance.update({
          where: { id: inst.id },
          data: { state: 'PENDING', timeEntryId: null, nextRemindAt: new Date(due) },
        });
      }
      // Rests, presence, excursions and work-log cascade with the entry.
      await tx.timeEntry.delete({ where: { id: entry.id } });
      await tx.activityLog.create({
        data: {
          eventType: AUTO_UNDO_EVENT,
          userId: data.userId,
          targetUserId: data.userId,
          resourceType: 'timeEntry',
          resourceId: entry.id,
          organizationId: data.organizationId,
          metadata: {
            undoneAt: at.toISOString(),
            entry: { locationId: entry.locationId, clockInAt: entry.clockInAt.toISOString(), flagReasons: entry.flagReasons ?? [] },
          } as never,
        },
      });
    });
    this.logger.log(`Automatic clock-in undone: entry=${entry.id}, user=${data.userId}`);
    this.notificationClient.emit('attendance_changed', { organizationId: data.organizationId, action: 'auto-undo', entryId: entry.id });
    return success({ undone: true as const }, 'Clock-in undone');
  }

  // ── "Still working" on the automatic rest ───────────────────────────────

  /** No automatic rest on this shift. Own running entry; a replay (or a second tap) answers done. */
  async skipRest(data: { userId: string; organizationId: string; entryId: string; evidence?: OccurrenceEvidence }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id: data.entryId, userId: data.userId, organizationId: data.organizationId },
      select: { id: true, status: true, clockInAt: true, autoRestSkippedAt: true },
    });
    if (!entry) throw new NotFoundException('Time entry not found');
    if (entry.autoRestSkippedAt) return success({ skipped: true as const }, 'Already skipped');
    if (entry.status !== TimeEntryStatus.CLOCKED_IN) {
      throw new ConflictException({ message: 'This shift is already closed', code: 'ENTRY_ALREADY_CLOSED' });
    }
    const at = judgeOccurrence(data.evidence, entry.clockInAt).at;
    // Conditional: a close racing this either sees the skip or has already run.
    await this.prisma.timeEntry.updateMany({
      where: { id: entry.id, status: TimeEntryStatus.CLOCKED_IN, autoRestSkippedAt: null },
      data: { autoRestSkippedAt: at },
    });
    return success({ skipped: true as const }, 'No automatic rest today');
  }
}

function dedupeById(rows: DayRequestRow[]): DayRequestRow[] {
  const seen = new Map<string, DayRequestRow>();
  for (const r of rows) seen.set(r.id, r);
  return [...seen.values()];
}
