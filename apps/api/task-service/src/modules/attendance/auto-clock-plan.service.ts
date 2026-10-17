import { Injectable, Logger } from '@nestjs/common';
import {
  zoneOf,
  activeAssignmentWhere,
  addDaysStr,
  autoClockOffered,
  geofenceArmRadius,
  localPartsIn,
  parseGeofencePolygon,
  spaceRunsClock,
  success,
  zonedWallTimeToUtc,
  type AutoClockPlace,
  type MemberAutoClockSettings,
} from '@hbcfield/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ShiftResolverService } from './shift-resolver.service';
import { approvedRequestsAround, dayRequestEffect } from './approved-requests';
import { dedupeById } from './auto-clock-helpers';

/**
 * Where the phone should arm for the caller: their workspaces, rings, settings and
 * shifts for yesterday, today and tomorrow.
 */
@Injectable()
export class AutoClockPlanService {
  private readonly logger = new Logger(AutoClockPlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftResolver: ShiftResolverService,
  ) {}

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
    if (!user || user.isExternal)
      return success({ consentAt: consentIso, places: [], generatedAt, offered: 0, offeredIn: [] });

    const tomorrow = new Date(now.getTime() + 86_400_000);
    const assignments = await this.prisma.spaceAssignment.findMany({
      where: {
        autoClock: true,
        OR: [activeAssignmentWhere(data.userId, now), activeAssignmentWhere(data.userId, tomorrow)],
      },
      select: { spaceId: true, autoClock: true, autoClockMode: true, autoClockStartWindow: true },
    });
    const spaceIds = [...new Set(assignments.map((a) => a.spaceId))];
    // How this member is clocked in each workspace (PRESENCE wins when any active row says so).
    const assignmentFor = (spaceId: string) =>
      assignments.find((a) => a.spaceId === spaceId && a.autoClockMode === 'PRESENCE') ??
      assignments.find((a) => a.spaceId === spaceId)!;
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
        id: true,
        name: true,
        lat: true,
        lng: true,
        geofenceRadius: true,
        geofencePolygon: true,
        timezone: true,
        workModel: true,
        autoClock: true,
        enabledModules: true,
        noShiftDailyMinutes: true,
        noShiftPolicy: true,
        organization: { select: { enabledModules: true } },
      },
      orderBy: { name: 'asc' },
    });
    // Where the OFFICE has chosen them (consent aside) — what decides whether the
    // phone offers the switch at all. A count only: nothing of a workspace's
    // settings reaches a member who has not agreed.
    const chosen = locations
      .map((l) => {
        const a = assignmentFor(l.id);
        return {
          l,
          settings: autoClockOffered({
            settings: l.autoClock,
            assignmentAutoClock: true,
            isExternal: user.isExternal,
            mode: a.autoClockMode,
            startWindow: a.autoClockStartWindow,
            noShiftDailyMinutes: l.noShiftDailyMinutes,
            noShiftPolicy: l.noShiftPolicy,
          }),
        };
      })
      // The clock-in refuses where Time Tracking is off — never arm a site that cannot clock.
      .filter(
        (x): x is { l: (typeof locations)[number]; settings: MemberAutoClockSettings } =>
          !!x.settings &&
          spaceRunsClock(x.l.enabledModules as string[] | null, x.l.organization?.enabledModules as string[] | null),
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
    const spaces = active.map(({ l }) => ({
      id: l.id,
      timezone: zoneOf(l.timezone),
      workModel: l.workModel,
      lat: l.lat,
      lng: l.lng,
    }));
    const [windows, requestsToday, requestsTomorrow] = await Promise.all([
      this.shiftResolver.plannedWindows(data.userId, spaces, (s) => daysOf(s.timezone)),
      approvedRequestsAround(this.prisma, data.userId, now),
      approvedRequestsAround(this.prisma, data.userId, tomorrow),
    ]);
    const requests = dedupeById([...requestsToday, ...requestsTomorrow]);

    const places: AutoClockPlace[] = active.map(({ l, settings }) => {
      const tz = zoneOf(l.timezone);
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
        radius: geofenceArmRadius({
          lat: l.lat,
          lng: l.lng,
          geofenceRadius: l.geofenceRadius,
          geofencePolygon: polygon,
        }),
        polygon,
        settings,
        shifts,
        presence:
          settings.mode === 'PRESENCE'
            ? {
                startWindow: settings.startWindow,
                timezone: tz,
                noShiftMinutes: settings.noShiftMinutes,
                noShiftLimit: settings.noShiftLimit,
              }
            : null,
      };
    });
    return success({ consentAt: consentIso, places, generatedAt, offered, offeredIn });
  }
}
