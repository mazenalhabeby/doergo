import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  ABSENCE_WHERE,
  PrismaService,
  addDaysStr,
  buildIcs,
  isOrganizationSuspended,
  localPartsIn,
  repeatToRrule,
  success,
  type IcsEvent,
  type Repeat,
  toISODateString,
  hashCode,
} from '@hbcfield/shared';
import { CalendarRulesService } from './calendar-rules.service';

const TOKEN = /^[A-Za-z0-9_-]{40,64}$/;
const sha = hashCode;

/**
 * The optional one-way feed: a private link a member pastes into Google, Outlook or the iPhone.
 *
 * Only the SHA-256 of the token is stored, so the link is shown once — a lost link is replaced,
 * never recovered. The feed carries the member's OWN things only (their appointments, their leave,
 * their workspace's holidays, the titles of their jobs): nothing about a colleague leaves through it.
 * It dies with the account, with the organization being switched off, and with the organization
 * turning feeds off.
 */
@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: CalendarRulesService,
  ) {}

  async status(dto: { userId: string; organizationId: string }) {
    const [org, row] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: dto.organizationId }, select: { calendarFeedsEnabled: true } }),
      this.prisma.calendarFeedToken.findUnique({ where: { userId: dto.userId }, select: { createdAt: true, lastUsedAt: true } }),
    ]);
    return success({ allowed: !!org?.calendarFeedsEnabled, active: !!row, createdAt: row?.createdAt ?? null, lastUsedAt: row?.lastUsedAt ?? null });
  }

  /** A new link (any old one stops working). Returned once. */
  async rotate(dto: { userId: string; organizationId: string }) {
    const org = await this.prisma.organization.findUnique({ where: { id: dto.organizationId }, select: { calendarFeedsEnabled: true } });
    if (!org?.calendarFeedsEnabled) throw new ForbiddenException({ code: 'CALENDAR_FEEDS_OFF', message: 'Your organization has switched calendar links off.' });
    const token = randomBytes(32).toString('base64url');
    await this.prisma.calendarFeedToken.upsert({
      where: { userId: dto.userId },
      create: { userId: dto.userId, organizationId: dto.organizationId, tokenHash: sha(token) },
      update: { tokenHash: sha(token), createdAt: new Date(), lastUsedAt: null, organizationId: dto.organizationId },
    });
    return success({ token });
  }

  async revoke(dto: { userId: string }) {
    await this.prisma.calendarFeedToken.deleteMany({ where: { userId: dto.userId } });
    return success({ ok: true });
  }

  /** The ICS document behind a link. Every failure is the same 404 — a guessed token learns nothing. */
  async render(dto: { token: string }): Promise<string> {
    if (!TOKEN.test(dto.token ?? '')) throw new NotFoundException();
    const row = await this.prisma.calendarFeedToken.findUnique({
      where: { tokenHash: sha(dto.token) },
      include: {
        user: {
          select: {
            id: true, isActive: true, firstName: true, organizationId: true,
            organization: { select: { id: true, name: true, timezone: true, calendarFeedsEnabled: true, suspendedAt: true, isActive: true } },
          },
        },
      },
    });
    const u = row?.user;
    const org = u?.organization;
    if (!row || !u || !u.isActive || !org || !org.isActive || !org.calendarFeedsEnabled || isOrganizationSuspended(org as any) || u.organizationId !== row.organizationId) {
      throw new NotFoundException();
    }
    const now = new Date();
    if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > 3600000) {
      await this.prisma.calendarFeedToken.update({ where: { id: row.id }, data: { lastUsedAt: now } }).catch(() => undefined);
    }
    const tz = org.timezone || 'Europe/Vienna';
    const today = localPartsIn(now, tz).dateStr;
    const from = addDaysStr(today, -30), to = addDaysStr(today, 365);
    const fromAt = new Date(now.getTime() - 30 * 86400000);

    const [events, leave, jobs, spaceIds] = await Promise.all([
      this.prisma.calendarEvent.findMany({
        where: { organizationId: org.id, canceledAt: null, OR: [{ seriesEndAt: null }, { seriesEndAt: { gt: fromAt } }], attendees: { some: { userId: u.id, response: { not: 'DECLINED' } } } },
        select: { id: true, title: true, description: true, location: true, meetingUrl: true, startAt: true, endAt: true, allDay: true, timezone: true, repeat: true, updatedAt: true },
        take: 1000,
      }),
      this.prisma.timeOff.findMany({
        where: { technicianId: u.id, status: 'APPROVED', ...ABSENCE_WHERE, endDate: { gte: new Date(`${from}T00:00:00Z`) } },
        select: { id: true, startDate: true, endDate: true, type: true, updatedAt: true },
        take: 200,
      }),
      this.prisma.task.findMany({
        where: { organizationId: org.id, dueDate: { gte: fromAt, lte: new Date(now.getTime() + 120 * 86400000) }, status: { notIn: ['CANCELED', 'COMPLETED', 'CLOSED'] }, OR: [{ assignedToId: u.id }, { assignees: { some: { userId: u.id } } }] },
        select: { id: true, title: true, dueDate: true, updatedAt: true },
        take: 300,
      }),
      this.rules.workspacesOf(org.id, u.id),
    ]);
    const places = await this.rules.places(org.id, spaceIds, from, to);
    const holidayPlaces = spaceIds.length ? spaceIds.map((id) => places.get(id)).filter(Boolean) : [places.get(null)].filter(Boolean);

    const out: IcsEvent[] = [];
    for (const e of events) {
      out.push({
        uid: `event-${e.id}@hbcfield.com`, title: e.title, description: e.description, location: e.location, url: e.meetingUrl,
        allDay: e.allDay,
        start: e.allDay ? localPartsIn(e.startAt, e.timezone).dateStr : e.startAt,
        end: e.allDay ? localPartsIn(e.endAt, e.timezone).dateStr : e.endAt,
        rrule: e.repeat ? repeatToRrule(e.repeat as unknown as Repeat, e.allDay) : null,
        tzid: e.repeat && !e.allDay ? e.timezone : null,
        updatedAt: e.updatedAt,
      });
    }
    for (const l of leave) {
      out.push({
        uid: `leave-${l.id}@hbcfield.com`, title: `Time off (${String(l.type).toLowerCase()})`, allDay: true,
        start: toISODateString(l.startDate), end: addDaysStr(toISODateString(l.endDate), 1), updatedAt: l.updatedAt,
      });
    }
    for (const t of jobs) {
      const local = localPartsIn(t.dueDate!, tz);
      const timed = local.minutesOfDay !== 0;
      out.push({
        uid: `job-${t.id}@hbcfield.com`, title: t.title, allDay: !timed,
        start: timed ? t.dueDate! : local.dateStr,
        end: timed ? new Date(t.dueDate!.getTime() + 3600000) : addDaysStr(local.dateStr, 1),
        updatedAt: t.updatedAt,
      });
    }
    const seen = new Set<string>();
    for (const p of holidayPlaces) {
      for (const h of p!.holidays) {
        if (seen.has(h.key + h.date)) continue;
        seen.add(h.key + h.date);
        out.push({ uid: `holiday-${sha(`${p!.place.spaceId}|${h.key}`).slice(0, 16)}@hbcfield.com`, title: h.name, allDay: true, start: h.date, end: addDaysStr(h.endDate, 1), transparent: true });
      }
    }
    return buildIcs(`${org.name} · ${u.firstName}`, out, now);
  }

}
