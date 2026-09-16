import {
  REMINDER_KINDS,
  REMINDER_LEADS,
  REMINDER_REPEATS,
  REMINDER_PRESETS,
  reminderPayload,
  reminderPresetDue,
  isReminderOverdue,
  isReminderKind,
  reminderLeadKey,
  reminderRepeatKey,
} from '@hbcfield/shared/client';

describe('a reminder payload is validated before it is sent', () => {
  it('keeps what the server recognises', () => {
    expect(
      reminderPayload({ dueAt: '2026-09-20T09:00:00.000Z', reminderKind: 'CALL', remindBeforeMin: 60, repeat: 'WEEKLY', reminderAssigneeId: 'u1' }),
    ).toEqual({
      dueAt: '2026-09-20T09:00:00.000Z',
      reminderKind: 'CALL',
      remindBeforeMin: 60,
      reminderAssigneeId: 'u1',
      repeat: 'WEEKLY',
    });
  });

  it('a value the server does not know becomes the default, never a stored string', () => {
    // The failure this prevents: repeat:'FORTNIGHTLY' persisting as text that
    // nothing will ever schedule, on a record that looks correct on screen.
    const out = reminderPayload({ reminderKind: 'MEETING', remindBeforeMin: 7, repeat: 'FORTNIGHTLY' as never });
    expect(out.reminderKind).toBe('OTHER');
    expect(out.remindBeforeMin).toBe(0);
    expect(out.repeat).toBe('NONE');
  });

  it('an empty assignee is null, not ""', () => {
    // "" is how a "nobody in particular" picker reports itself; the column is nullable.
    expect(reminderPayload({ reminderAssigneeId: '' }).reminderAssigneeId).toBeNull();
    expect(reminderPayload({}).reminderAssigneeId).toBeNull();
  });

  it('omits dueAt entirely rather than sending an empty one', () => {
    expect('dueAt' in reminderPayload({})).toBe(false);
  });

  it('MEETING is not a reminder reason — a meeting is a Task', () => {
    expect(isReminderKind('MEETING')).toBe(false);
    expect(REMINDER_KINDS).toEqual(['CALL', 'EMAIL', 'OTHER']);
  });
});

describe('the quick presets', () => {
  it('are anchored to NOW, not to midnight', () => {
    // Set at 23:50, "tomorrow" must not land ten minutes later.
    const late = new Date('2026-09-16T23:50:00.000Z');
    const due = reminderPresetDue('tomorrow', late);
    expect(due.getTime() - late.getTime()).toBe(32 * 3600_000);
    expect(due.getTime()).toBeGreaterThan(late.getTime() + 3600_000);
  });

  it('every preset moves forward and is ordered', () => {
    const now = new Date('2026-09-16T09:00:00.000Z');
    const times = REMINDER_PRESETS.map((p) => reminderPresetDue(p.key, now).getTime());
    expect(times.every((t) => t > now.getTime())).toBe(true);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe('overdue', () => {
  const now = new Date('2026-09-16T12:00:00.000Z');
  it('is past due AND still open', () => {
    expect(isReminderOverdue({ dueAt: '2026-09-16T11:00:00.000Z' }, now)).toBe(true);
    expect(isReminderOverdue({ dueAt: '2026-09-16T13:00:00.000Z' }, now)).toBe(false);
  });
  it('a done reminder is never overdue, however old', () => {
    expect(isReminderOverdue({ dueAt: '2020-01-01T00:00:00.000Z', doneAt: '2020-01-02T00:00:00.000Z' }, now)).toBe(false);
  });
  it('no due date is not overdue', () => {
    expect(isReminderOverdue({}, now)).toBe(false);
    expect(isReminderOverdue({ dueAt: null }, now)).toBe(false);
  });
});

describe('translation keys', () => {
  it('lead 0 is its own key, so it can read "At time" and not "0 minutes before"', () => {
    expect(reminderLeadKey(0)).toBe('customers.lead.0');
    expect(REMINDER_LEADS[0]).toBe(0);
  });
  it('repeat keys are lower-cased', () => {
    for (const r of REMINDER_REPEATS) expect(reminderRepeatKey(r)).toBe(`customers.repeat.${r.toLowerCase()}`);
  });
});
