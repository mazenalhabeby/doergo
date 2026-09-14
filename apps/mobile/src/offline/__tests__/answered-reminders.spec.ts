/**
 * A reminder the phone has already answered is not shown.
 *
 * With no signal, a clock-in waits in the outbox and the server — which has
 * received nothing — pushes "you haven't clocked in". The member did clock in.
 */
import { notificationTime, reminderAnswered } from '../attendance/answered-reminders';
import { isNotificationSuppressed, setNotificationSuppressor } from '../../lib/notification-suppression';

const T = Date.parse('2026-09-14T08:30:00.000Z');
const op = (o: string, state: string, minutesBefore: number) => ({ op: o, state, createdAt: T - minutesBefore * 60_000 }) as never;

describe('answered reminders', () => {
  it('a queued clock-in answers "you have not clocked in"', () => {
    expect(reminderAnswered({ type: 'noshow_reminder' }, T, [op('attendance.clockIn', 'pending', 32)])).toBe(true);
    expect(reminderAnswered({ type: 'noshow_reminder' }, T, [op('attendance.clockIn', 'awaiting_auth', 32)])).toBe(true);
  });

  it('each reminder is answered only by its own action', () => {
    expect(reminderAnswered({ type: 'noshow_reminder' }, T, [op('attendance.clockOut', 'pending', 5)])).toBe(false);
    expect(reminderAnswered({ type: 'shift_reminder' }, T, [op('attendance.clockOut', 'retry', 5)])).toBe(true);
    expect(reminderAnswered({ type: 'break_due' }, T, [op('attendance.breakStart', 'inflight', 1)])).toBe(true);
    expect(reminderAnswered({ type: 'break_over' }, T, [op('attendance.breakEnd', 'done', 1)])).toBe(true);
  });

  it('a refused or discarded action does not answer anything', () => {
    for (const state of ['failed', 'conflict', 'discarded']) {
      expect(reminderAnswered({ type: 'noshow_reminder' }, T, [op('attendance.clockIn', state, 10)])).toBe(false);
    }
  });

  it("yesterday's clock-in does not answer this morning's reminder", () => {
    expect(reminderAnswered({ type: 'noshow_reminder' }, T, [op('attendance.clockIn', 'done', 13 * 60)])).toBe(false);
  });

  it('never hides a notification it knows nothing about', () => {
    expect(reminderAnswered({ type: 'task_assigned' }, T, [op('attendance.clockIn', 'pending', 1)])).toBe(false);
    expect(reminderAnswered(undefined, T, [])).toBe(false);
  });

  it('reads notification dates in seconds or milliseconds', () => {
    expect(notificationTime(T / 1000)).toBe(T);
    expect(notificationTime(T)).toBe(T);
  });

  it('a suppressor that throws shows the notification rather than losing it', () => {
    setNotificationSuppressor(() => {
      throw new Error('boom');
    });
    expect(isNotificationSuppressed({ type: 'noshow_reminder' })).toBe(false);
    setNotificationSuppressor(null);
    expect(isNotificationSuppressed({ type: 'noshow_reminder' })).toBe(false);
  });
});
