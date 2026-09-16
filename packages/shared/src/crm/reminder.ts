/**
 * What a reminder is, in one place.
 *
 * The web grew the full set — a reason, an exact time, a lead time, a repeat,
 * an assignee — and the phone grew three preset chips and nothing else. The
 * columns exist (`CustomerActivity.reminderKind / remindBeforeMin /
 * reminderAssigneeId / repeat`) and the gateway has always accepted all four;
 * the phone simply never sent them.
 *
 * ⚠️ A REMINDER'S "CALL" AND A LOGGED "CALL" ARE OPPOSITE THINGS, and this is
 * the confusion that made this file necessary. `reminderKind: 'CALL'` is an
 * INTENT — remind me to call them on Tuesday. A `CustomerActivity` of type
 * `CALL` is a RECORD — I called them. Same word, opposite direction in time.
 * Both are wanted, so neither is removed; they are told apart by where the word
 * sits, and a reminder row must always render its reason so "Reminder · call"
 * can never be mistaken for a call that happened.
 *
 * ⚠️ MEETING is deliberately absent from the reasons. A meeting is real work
 * that somebody is assigned and turns up to — that is a Task, not a nag. The
 * enum still carries MEETING for activities that already happened.
 */

/** Why a reminder exists. Order is display order. */
export const REMINDER_KINDS = ['CALL', 'EMAIL', 'OTHER'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const REMINDER_KIND_KEYS: Record<ReminderKind, string> = {
  CALL: 'customers.reminderKind.call',
  EMAIL: 'customers.reminderKind.email',
  OTHER: 'customers.reminderKind.other',
};

export function isReminderKind(value: unknown): value is ReminderKind {
  return typeof value === 'string' && (REMINDER_KINDS as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */

/**
 * Lead time — fire this many minutes BEFORE the due time.
 *
 * The server computes `notifyAt = dueAt − remindBeforeMin` and the sweep keys
 * off that, so "remind me an hour before" needs no special case anywhere.
 */
export const REMINDER_LEADS = [0, 5, 15, 30, 60, 180, 1440, 2880, 10080] as const;
export type ReminderLead = (typeof REMINDER_LEADS)[number];

/** i18n key per lead time. `customers.lead.0` is "At time", not "0 minutes before". */
export const reminderLeadKey = (minutes: number): string => `customers.lead.${minutes}`;

export function isReminderLead(value: unknown): value is ReminderLead {
  return typeof value === 'number' && (REMINDER_LEADS as readonly number[]).includes(value);
}

/* ------------------------------------------------------------------ */

/** Recurrence. On completion the server schedules the next one. */
export const REMINDER_REPEATS = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type ReminderRepeat = (typeof REMINDER_REPEATS)[number];

export const reminderRepeatKey = (repeat: string): string =>
  `customers.repeat.${String(repeat).toLowerCase()}`;

export function isReminderRepeat(value: unknown): value is ReminderRepeat {
  return typeof value === 'string' && (REMINDER_REPEATS as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */

/**
 * The quick presets the phone offers — one tap, standing at a customer's door.
 *
 * Kept ALONGSIDE the full picker rather than replaced by it. "Tomorrow" is the
 * overwhelmingly common case in the field and making somebody spin a date wheel
 * for it would be a worse phone than the one that only had presets.
 *
 * ⚠️ Hours, not calendar days, and anchored to NOW rather than to midnight —
 * a reminder set at 23:50 for "tomorrow" must not land ten minutes later.
 */
export const REMINDER_PRESETS = [
  { key: 'today', hours: 8 },
  { key: 'tomorrow', hours: 32 },
  { key: 'nextWeek', hours: 24 * 7 },
] as const;
export type ReminderPresetKey = (typeof REMINDER_PRESETS)[number]['key'];

export const reminderPresetKey = (key: ReminderPresetKey): string => `customers.record.due.${key}`;

export function reminderPresetDue(key: ReminderPresetKey, now: Date = new Date()): Date {
  const preset = REMINDER_PRESETS.find((p) => p.key === key);
  return new Date(now.getTime() + (preset?.hours ?? 24) * 3600_000);
}

/* ------------------------------------------------------------------ */

export interface ReminderDraft {
  dueAt?: string | null;
  reminderKind?: string | null;
  remindBeforeMin?: number | null;
  reminderAssigneeId?: string | null;
  repeat?: string | null;
}

/**
 * A draft as the body the server accepts — with every value it does not
 * recognise dropped rather than passed through.
 *
 * ⚠️ Validated here and NOT trusted here. The server re-checks all of it; this
 * exists so a phone cannot put `repeat: 'FORTNIGHTLY'` on a record and have it
 * silently persist as a string nothing will ever schedule. A bad value becomes
 * the default, never an error the member cannot act on.
 */
export function reminderPayload(draft: ReminderDraft): {
  dueAt?: string;
  reminderKind: ReminderKind;
  remindBeforeMin: number;
  reminderAssigneeId: string | null;
  repeat: ReminderRepeat;
} {
  return {
    ...(draft.dueAt ? { dueAt: draft.dueAt } : {}),
    reminderKind: isReminderKind(draft.reminderKind) ? draft.reminderKind : 'OTHER',
    remindBeforeMin: isReminderLead(draft.remindBeforeMin) ? draft.remindBeforeMin : 0,
    // Empty string is how a "nobody in particular" <select> reports itself.
    reminderAssigneeId: draft.reminderAssigneeId ? draft.reminderAssigneeId : null,
    repeat: isReminderRepeat(draft.repeat) ? draft.repeat : 'NONE',
  };
}

/** Is this reminder past its due time and still open? */
export function isReminderOverdue(
  activity: { dueAt?: string | null; doneAt?: string | null },
  now: Date = new Date(),
): boolean {
  if (!activity.dueAt || activity.doneAt) return false;
  return new Date(activity.dueAt).getTime() < now.getTime();
}
