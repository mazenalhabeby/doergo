import { getEndOfDay, getStartOfDay } from '@hbcfield/shared/client';
import type { ClientsDue, DueReminder } from '../../lib/api/customers';
import type { Phrase } from './phrase';

/**
 * What the Clients card says — pure, so the words are tested.
 * `docs/design/clients` §⑤ and §⑦.
 *
 * ⭐ THE HEADLINE IS THE KIND, NOT A GUESS. One kind: name it ("3 owed a
 * call"). Several: count them ("5 need you"). The same rule the documents
 * strip uses — one line, several kinds.
 *
 * ⚠️ The line under it ALWAYS carries the split, even when the headline names
 * one kind — "3 owed a call" still has to say how many are late.
 */

export function headline(due: Pick<ClientsDue, 'total' | 'counts' | 'items'>): { title: Phrase; split: Phrase[] } | null {
  const n = due.total;
  if (n === 0) return null;
  const { call, email, other, overdue } = due.counts;
  const oneKind = [call, email, other].filter((x) => x > 0).length === 1;

  let title: Phrase;
  const split: Phrase[] = [];
  if (oneKind && call) title = { key: 'clientsCard.owedCallLabel', values: { count: n } };
  else if (oneKind && email) title = { key: 'clientsCard.owedEmailLabel', values: { count: n } };
  else title = { key: 'clientsCard.needYouLabel', values: { count: n } };

  if (oneKind && (call || email)) {
    const today = n - overdue;
    if (overdue === 0) split.push({ key: n === 1 ? 'clientsCard.split.today' : n === 2 ? 'clientsCard.split.bothToday' : 'clientsCard.split.allToday' });
    else if (today === 0) split.push({ key: 'clientsCard.split.overdue', values: { count: overdue } });
    else split.push({ key: 'clientsCard.split.overdue', values: { count: overdue } }, { key: 'clientsCard.split.todayCount', values: { count: today } });
  } else {
    if (call) split.push({ key: 'clientsCard.split.calls', values: { count: call } });
    if (email) split.push({ key: 'clientsCard.split.emails', values: { count: email } });
    if (other) split.push({ key: 'clientsCard.split.other', values: { count: other } });
  }
  // §⑧ — somebody else may already have rung them.
  const shared = due.items.filter((i) => i.shared > 1).length;
  if (shared) split.push({ key: 'clientsCard.split.notYoursAlone', values: { count: shared } });
  return { title, split };
}

/**
 * One row. ⭐ THE ROW LEADS WITH THE VERB and always says it is a reminder —
 * `reminderKind: 'CALL'` is an intent and a logged call is a record; only the
 * words tell them apart (shared/crm/reminder.ts).
 *
 * OTHER has no verb of its own, so the note IS the title and the client moves
 * to the second line.
 */
export function rowLines(r: DueReminder): { title: Phrase; reason: Phrase } {
  if (r.kind === 'OTHER') {
    return {
      title: r.note ? { key: 'clientsCard.row.note', values: { note: r.note } } : { key: 'clientsCard.row.other', values: { name: r.name } },
      reason: { key: 'clientsCard.row.otherReason', values: { name: r.name } },
    };
  }
  const verb = r.kind === 'CALL' ? 'ring' : 'email';
  const why: Phrase = r.shared > 1
    ? { key: `clientsCard.row.${verb}Shared`, values: { count: r.shared } }
    : r.note
      ? { key: `clientsCard.row.${verb}Why`, values: { note: r.note } }
      : { key: `clientsCard.row.${verb}Reason` };
  return { title: { key: `clientsCard.row.${verb}`, values: { name: r.name } }, reason: why };
}

/**
 * The server's answer, less the rows the member has just ticked off.
 *
 * A ticked row waits a few seconds for Undo before anything is sent, and the
 * minute refresh would otherwise put it straight back — and the count with
 * it. So the count is always "what the server says, minus what I have done".
 */
export function withoutDone(due: ClientsDue, done: DueReminder[], dayStart: Date): ClientsDue {
  const here = new Set(due.items.map((i) => i.id));
  const gone = done.filter((r) => here.has(r.id));
  if (!gone.length) return due;
  const counts = { ...due.counts };
  for (const r of gone) {
    const k = r.kind === 'CALL' ? 'call' : r.kind === 'EMAIL' ? 'email' : 'other';
    counts[k] = Math.max(0, counts[k] - 1);
    if (daysLate(r.dueAt, dayStart) != null) counts.overdue = Math.max(0, counts.overdue - 1);
  }
  return { ...due, counts, total: Math.max(0, due.total - gone.length) };
}

/** How late, in whole days — or null when it is due today. */
export function daysLate(dueAt: string | null, dayStart: Date): number | null {
  if (!dueAt) return null;
  const t = Date.parse(dueAt);
  if (t >= dayStart.getTime()) return null;
  return Math.max(1, Math.ceil((dayStart.getTime() - t) / 86_400_000));
}

/** The member's own day, which is what "today" means on this card. */
export function localDay(now: Date = new Date()): { start: Date; end: Date } {
  return { start: getStartOfDay(now), end: getEndOfDay(now) };
}
