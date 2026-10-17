import { BadRequestException } from '@nestjs/common';
import {
  personName,
  zoneOf,
  TaskStatus,
  isAtSite,
  formatDistance,
  ATTENDANCE_CONSTANTS,
  endOfSiteDay,
  tzOffsetMs,
  ONE_AT_A_TIME_STATUSES,
  OFFICE_START_CODES,
  OFFICE_START_REASON_MAX,
} from '@hbcfield/shared';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { fixOfTap } from '../../common/occurrence.util';
import type { OfficeStart, StatusTask, UpdateStatusInput } from './task-status.types';

/**
 * The execution gates of `TaskStatusService.updateStatus` — the office starting
 * a job for somebody, being at the site, the due date, one job at a time.
 */

/*
  ── The office starting somebody's job for them ──

  Allowed — a phone dies on site — but never silent: it needs a reason, it
  is recorded as the office's action FOR that person ("Started by Anna
  (office) for Mike"), and they are told. The time it really started may be
  given, never before they clocked in and never in the future, so job time
  still only runs inside their shift.
*/
export async function officeStartFor(
  prisma: PrismaService,
  data: UpdateStatusInput,
  assignedToId: string,
  onClock: { userId: string; clockInAt: Date } | null,
  previousAt: Date | null,
): Promise<OfficeStart> {
  const reason = (data.onBehalf?.reason ?? '').trim().slice(0, OFFICE_START_REASON_MAX);
  if (!reason) {
    const who = await prisma.user.findUnique({
      where: { id: onClock?.userId ?? assignedToId },
      select: { firstName: true, lastName: true },
    });
    throw new BadRequestException({
      message: 'Say why the office is starting this job for them.',
      code: OFFICE_START_CODES.REASON_REQUIRED,
      params: {
        name: who ? personName(who) : '',
        clockInAt: onClock?.clockInAt.toISOString() ?? null,
      },
    });
  }
  let at: Date | null = null;
  if (data.onBehalf?.at) {
    at = new Date(data.onBehalf.at);
    const tooEarly = onClock ? at.getTime() < onClock.clockInAt.getTime() : false;
    if (
      Number.isNaN(at.getTime()) ||
      at.getTime() > Date.now() + 60_000 ||
      tooEarly ||
      (previousAt && at.getTime() < previousAt.getTime())
    ) {
      throw new BadRequestException({
        message: 'The start time must be inside their shift, after the last change and not in the future.',
        code: OFFICE_START_CODES.TIME_OUTSIDE_SHIFT,
        params: { clockInAt: onClock?.clockInAt.toISOString() ?? null },
      });
    }
  }
  return { forUserId: onClock?.userId ?? assignedToId, reason, at };
}

/**
 * (0) Location Verification — the assigned user must be within the geofence of
 * the task location to arrive/start. Asked only of the assigned user.
 *
 * ⚠️ Writes the tap's own position onto `data` (lat/lng/accuracy) when the
 * phone recorded one, exactly as the inline check always did.
 */
export async function assertAtJobSite(
  prisma: PrismaService,
  task: StatusTask,
  data: UpdateStatusInput,
  occurredAt: Date,
  occurrenceFlags: Parameters<typeof fixOfTap>[2],
): Promise<void> {
  const locationRequiredStatuses = [TaskStatus.ARRIVED, TaskStatus.IN_PROGRESS];
  if (
    !locationRequiredStatuses.includes(data.status as TaskStatus) ||
    task.locationLat == null ||
    task.locationLng == null
  ) {
    return;
  }
  /*
    The position of the TAP when the phone recorded one — a change synced
    from a basement must not be judged by where the phone is at sync time.
  */
  const fix = fixOfTap(data.evidence, occurredAt, occurrenceFlags);
  if (fix) {
    data.lat = fix.lat;
    data.lng = fix.lng;
    data.accuracy = fix.accuracy;
  }
  if (data.lat == null || data.lng == null) {
    throw new BadRequestException('Location verification required. Please enable GPS and try again.');
  }

  /*
    Judged by the SAME rule as clocking in at a workspace.

    This used to be its own haversine against a private 20-metre constant,
    and it was wrong twice over. Twenty metres is inside the error of an
    ordinary phone fix — 5 to 50 metres, worse beside a building — so a
    technician standing at the customer's door was regularly told they were
    thirty-five metres away. And the device REPORTS how unsure it is, which
    the check discarded: a fix saying "here, ±40m" was judged as though it
    had said "here, exactly".

    `isAtSite` already answers this, widening the zone by the reported
    accuracy for exactly the reason it matters most where the signal is
    worst. Wrongly refusing somebody who is standing at the job stops them
    working; wrongly accepting produces a record a human can look at.
  */
  const radius = await arrivalRadiusFor(prisma, task);
  const at = isAtSite(
    { lat: data.lat, lng: data.lng, accuracy: data.accuracy ?? null },
    { lat: task.locationLat, lng: task.locationLng, geofenceRadius: radius, geofencePolygon: null },
  );

  if (!at.inside) {
    /*
      A CODE and the two figures, so the phone and the web write the
      sentence in the member's language with the distance as a person says
      it. The English `message` stays for any client that reads only that —
      and it says "9,631 km", never "9630871m", which is what a member once
      read here.
    */
    const away = Math.round(at.distanceToCentre ?? at.metresOutside);
    const arriving = data.status === TaskStatus.ARRIVED;
    throw new BadRequestException({
      message:
        `You are ${formatDistance(away)} from the job site. You need to be within ${formatDistance(radius)} ` +
        `to ${arriving ? 'mark it as arrived' : 'start the job'}. Please move closer and try again.`,
      code: arriving ? 'TOO_FAR_TO_ARRIVE' : 'TOO_FAR_TO_START',
      params: { distanceMetres: away, radiusMetres: radius },
    });
  }
}

/**
 * How close counts as "at the job".
 *
 * The workspace's own geofence radius, because that is the number an
 * organization has already chosen to mean "near enough to a site" — it is set
 * on the workspace, understood by whoever set it, and bounded there between 10
 * and 500 metres. Falling back to ATTENDANCE_CONSTANTS.DEFAULT_GEOFENCE_RADIUS
 * rather than a number private to this file, so there is one default in the
 * product instead of two that disagree (this one said 20 while attendance said
 * 50, and nobody had chosen the 20).
 *
 * ⚠️ A limitation worth naming: the radius describes the WORKSPACE, while a
 * task is often at a customer's address. It is being used as the
 * organization's tolerance for "at a site" rather than as a fact about this
 * particular place. That is a real improvement on a hardcoded 20 and still not
 * the same as a radius per customer site, which is what this should grow into
 * if anybody needs different tolerances for a depot and a tower block.
 */
async function arrivalRadiusFor(prisma: PrismaService, task: { spaceId?: string | null }): Promise<number> {
  const fallback = ATTENDANCE_CONSTANTS.DEFAULT_GEOFENCE_RADIUS;
  if (!task.spaceId) return fallback;
  const space = await prisma.companyLocation.findUnique({
    where: { id: task.spaceId },
    select: { geofenceRadius: true },
  });
  return space?.geofenceRadius && space.geofenceRadius > 0 ? space.geofenceRadius : fallback;
}

/*
  (a) Due Date Gate — cannot start a task whose dueDate is in the future.

  ⚠️ "Today" is the SITE's day. This used to be `new Date().setHours(23,...)`,
  which is the container's day, and the container runs in UTC: a job due at
  20:00 in New York is 01:00 the next day in UTC, so this refused to let
  anyone set off — on the afternoon it was due. Nobody hit it while due
  dates were dates, because midnight local is still the same UTC day either
  side of the Atlantic. An hour on the due date makes it an everyday event.

  ⚠️ Still DAY-granular, deliberately. Comparing instants would refuse to
  let a member leave at 12:13 for a 13:00 appointment — which is exactly
  when they must leave to arrive on time.
*/
export function assertDueBySiteDay(task: StatusTask, occurredAt: Date): void {
  if (!task.dueDate) return;
  const tz = zoneOf(task.space?.timezone);
  // The day the member set off, which for a change synced later is not today.
  const endOfToday = endOfSiteDay(occurredAt, tzOffsetMs(occurredAt, tz) / 60_000);
  if (task.dueDate > endOfToday) {
    throw new BadRequestException(
      'Cannot start this task yet — it is scheduled for a future date. You can start it on the due date.',
    );
  }
}

/**
 * (b) Single Active Task — only one task in execution state at a time.
 * BLOCKED is excluded, so blocking a task frees the slot.
 */
export async function assertNoOtherActiveTask(prisma: PrismaService, userId: string, taskId: string): Promise<void> {
  const activeTaskCount = await prisma.task.count({
    where: {
      assignedToId: userId,
      // The one list, shared with the phone (it says this before the tap).
      status: { in: [...ONE_AT_A_TIME_STATUSES] as TaskStatus[] },
      id: { not: taskId },
    },
  });

  if (activeTaskCount > 0) {
    const activeTask = await prisma.task.findFirst({
      where: {
        assignedToId: userId,
        status: { in: [...ONE_AT_A_TIME_STATUSES] as TaskStatus[] },
        id: { not: taskId },
      },
      select: { title: true },
    });
    throw new BadRequestException(
      `You already have an active task: "${activeTask?.title || 'Unknown'}". Complete or block it before accepting another.`,
    );
  }
}
