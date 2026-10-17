import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SNOOZE_MINUTES, nextReminder, occurrences, success, type Repeat, type RsvpResponse } from '@hbcfield/shared';
import { ISO, Caller, EventRow, reminderEventOf } from './events-helpers';
import { EventsBase } from './events.base';

/**
 * An attendee's answers and reminders: accept/decline, snooze, done, and the
 * minute sweep that sends what is due.
 */
@Injectable()
export class EventAnswersService extends EventsBase {
  private async myRow(caller: Caller, eventId: string) {
    const row = await this.prisma.calendarAttendee.findFirst({
      where: { eventId, userId: caller.userId, organizationId: caller.organizationId, event: { canceledAt: null } },
      include: { event: true },
    });
    if (!row) throw new NotFoundException('Not found');
    return row;
  }

  async respond(dto: Caller & { eventId: string; response: RsvpResponse }) {
    if (!['ACCEPTED', 'MAYBE', 'DECLINED'].includes(dto.response)) throw new BadRequestException('Answer accept, maybe or decline');
    const row = await this.myRow(dto, dto.eventId);
    if (row.isOrganizer) throw new BadRequestException({ code: 'EVENT_ORGANIZER_ANSWERS', message: 'You made it — you are going.' });
    const next = dto.response === 'DECLINED' ? null : nextReminder(reminderEventOf(row.event as unknown as EventRow), new Date());
    await this.prisma.calendarAttendee.update({
      where: { id: row.id },
      data: { response: dto.response, respondedAt: new Date(), nextRemindAt: next?.at ?? null, remindOccurrence: next?.occurrence ?? null },
    });
    if (row.response !== dto.response) {
      this.notify('calendar_responded', {
        organizationId: dto.organizationId, eventId: row.eventId, title: row.event.title,
        organizerId: row.event.createdById, responderId: dto.userId, responderName: await this.nameOf(dto.userId), response: dto.response,
      });
    }
    this.refresh(dto.organizationId, [dto.userId, row.event.createdById]);
    return success({ response: dto.response });
  }

  /**
   * Which occurrence a button press is about. After a reminder is sent the row already points at
   * the NEXT one, so the push carries the occurrence it announced; it is accepted only when it
   * really is an occurrence of this series. Without one, the row's own.
   */
  private occurrenceOf(row: { event: unknown; remindOccurrence: Date | null }, claimed?: string): Date | null {
    const ev = row.event as EventRow;
    if (claimed && ISO.test(claimed)) {
      const at = new Date(claimed);
      const dur = Math.max(ev.endAt.getTime() - ev.startAt.getTime(), 0);
      const hit = occurrences(ev.startAt, dur, (ev.repeat as Repeat | null) ?? null, ev.timezone, new Date(at.getTime() - 60000), new Date(at.getTime() + 60000))
        .find((o) => o.getTime() === at.getTime());
      if (hit) return hit;
    }
    return row.remindOccurrence ?? ev.startAt;
  }

  /** "+10 min" on the reminder — about the occurrence the push named. */
  async snooze(dto: Caller & { eventId: string; minutes?: number; occurrence?: string }) {
    const row = await this.myRow(dto, dto.eventId);
    const minutes = [5, 10, 15, 30, 60].includes(Number(dto.minutes)) ? Number(dto.minutes) : SNOOZE_MINUTES;
    const at = new Date(Date.now() + minutes * 60000);
    await this.prisma.calendarAttendee.update({ where: { id: row.id }, data: { nextRemindAt: at, remindOccurrence: this.occurrenceOf(row, dto.occurrence) } });
    return success({ nextRemindAt: at.toISOString() });
  }

  /** "Done" on the reminder: nothing more about THIS occurrence; the next one is planned. */
  async done(dto: Caller & { eventId: string; occurrence?: string }) {
    const row = await this.myRow(dto, dto.eventId);
    const next = nextReminder(reminderEventOf(row.event as unknown as EventRow), new Date(), this.occurrenceOf(row, dto.occurrence));
    await this.prisma.calendarAttendee.update({ where: { id: row.id }, data: { nextRemindAt: next?.at ?? null, remindOccurrence: next?.occurrence ?? null } });
    return success({ nextRemindAt: next?.at.toISOString() ?? null });
  }

  // ─── the reminder sweep ───────────────────────────────────────────────────

  /**
   * Everything due, claimed row by row with a conditional write (two replicas never send twice),
   * then moved on to its next reminder. Bounded per run; the next minute takes the rest.
   */
  async sweepDue(now = new Date()): Promise<number> {
    const due = await this.prisma.calendarAttendee.findMany({
      where: { nextRemindAt: { lte: now } },
      include: { event: true, user: { select: { isActive: true, organizationId: true, organization: { select: { suspendedAt: true } } } } },
      orderBy: { nextRemindAt: 'asc' },
      take: 200,
    });
    let sent = 0;
    for (const row of due) {
      const ev = row.event as unknown as EventRow;
      // A member who left, was switched off, or whose organization is suspended is not reminded.
      const gone = !row.user?.isActive || row.user.organizationId !== row.organizationId || !!row.user.organization?.suspendedAt;
      const stale = ev.canceledAt || row.response === 'DECLINED' || gone;
      const next = stale ? null : nextReminder(reminderEventOf(ev), now);
      const claimed = await this.prisma.calendarAttendee.updateMany({
        where: { id: row.id, nextRemindAt: row.nextRemindAt },
        data: { nextRemindAt: next?.at ?? null, remindOccurrence: next?.occurrence ?? null },
      });
      if (claimed.count !== 1 || stale) continue;
      const occurrence = row.remindOccurrence ?? ev.startAt;
      // A reminder for something already over is dropped silently — the phone was off, not the person.
      if (occurrence.getTime() + Math.max(ev.endAt.getTime() - ev.startAt.getTime(), 0) < now.getTime()) continue;
      this.notify('calendar_reminder', {
        organizationId: ev.organizationId, userId: row.userId, eventId: ev.id, kind: ev.kind,
        title: ev.title, occurrence: occurrence.toISOString(), allDay: ev.allDay, timezone: ev.timezone,
        minutes: Math.max(0, Math.round((occurrence.getTime() - now.getTime()) / 60000)),
        meetingUrl: ev.meetingUrl,
      });
      sent++;
    }
    return sent;
  }
}
