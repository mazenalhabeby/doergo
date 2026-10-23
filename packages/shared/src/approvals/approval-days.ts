/**
 * One person's working day as ONE inbox item — the late arrival, the missed
 * rest, the extra time and the step off site of a single day used to be four
 * separate rows. Pure; the gateway attaches the days to the inbox response and
 * both apps render them in place of their member items.
 *
 * ⚠️ A day only GROUPS. Each member item is still decided through its own
 * route as the caller (`/approvals/decide-day` replays them one by one), so
 * nothing about who may decide changes. A day is formed only when two or more
 * time items share a person and a local day — one item stays itself.
 */
import { localDateKey } from '../utils/date';
import { reviewLabels } from '../attendance/labels/catalogue';
import {
  APPROVAL_KIND_SPECS,
  type ApprovalGroup,
  type ApprovalItem,
  type ApprovalKind,
  type ApprovalsResponse,
} from './approval-kinds';

/** The kinds that belong to a person's working day. */
export const DAY_KINDS = [
  'hours',
  'away',
  'extraTime',
  'overtime',
  'outside',
] as const satisfies readonly ApprovalKind[];
export type WorkDayKind = (typeof DAY_KINDS)[number];

/** Kinds "Approve day" may decide with no extra input; extra time, overtime and time outside the shift need minutes. */
export const DAY_APPROVABLE_KINDS: readonly WorkDayKind[] = ['hours', 'away'];

/** A kind whose decision needs minutes (extra time, overtime, time outside the shift) — reviewed, never "Approve day". */
export function kindNeedsMinutes(kind: ApprovalKind): boolean {
  return APPROVAL_KIND_SPECS[kind].actions.some((a) => a.input === 'minutes');
}

/** The most a day may carry — a sanity bound for the replay. */
export const MAX_DAY_ITEMS = 10;

export interface ApprovalDayMember {
  kind: WorkDayKind;
  id: string;
}

export interface ApprovalDay {
  /** `day:{subjectId}:{yyyy-mm-dd}` — stable for one person and day. */
  key: string;
  subject: ApprovalItem['subject'];
  space: ApprovalItem['space'];
  /** The day in the workspace's zone (yyyy-mm-dd). */
  localDate: string;
  timezone: string | null;
  members: ApprovalDayMember[];
  /** Members "Approve day" decides; the rest are opened one by one. */
  approvable: ApprovalDayMember[];
  /** Review labels across the day's hours (codes from the label catalogue), most serious first. */
  labels: string[];
  /** The kinds present besides hours (extra time, overtime, away), for chips. */
  kinds: WorkDayKind[];
  group: ApprovalGroup;
  raisedAt: string | null;
  /** Every member may be decided by the caller. */
  canDecide: boolean;
}

const isWorkDayKind = (k: ApprovalKind): k is WorkDayKind => (DAY_KINDS as readonly string[]).includes(k);

/** When an item happened, for placing it on a day. */
function momentOf(i: ApprovalItem): string | null {
  const d = i.data;
  const pick = (v: unknown) => (typeof v === 'string' && v ? v : null);
  switch (i.kind) {
    case 'hours':
    case 'extraTime':
    case 'outside':
      return pick(d.clockInAt) ?? i.raisedAt;
    case 'overtime':
      return pick(d.overtimeStartAt) ?? i.raisedAt;
    case 'away':
      return pick(d.leftAt) ?? i.raisedAt;
    default:
      return null;
  }
}

const GROUP_RANK: Record<ApprovalGroup, number> = { NOW: 0, TODAY: 1, LATER: 2 };

export const memberKey = (m: { kind: string; id: string }) => `${m.kind}:${m.id}`;

/** The working days among the caller's items — only where a person has two or more on one day. */
export function approvalDays(items: readonly ApprovalItem[]): ApprovalDay[] {
  const byDay = new Map<string, ApprovalItem[]>();
  const zoneOf = new Map<string, string | null>();
  for (const i of items) {
    if (!isWorkDayKind(i.kind) || !i.subject.id) continue;
    const at = momentOf(i);
    if (!at) continue;
    const tz = typeof i.data.timezone === 'string' ? i.data.timezone : null;
    const key = `day:${i.subject.id}:${localDateKey(at, tz)}`;
    const list = byDay.get(key);
    if (list) list.push(i);
    else byDay.set(key, [i]);
    if (!zoneOf.get(key)) zoneOf.set(key, tz);
  }
  const days: ApprovalDay[] = [];
  for (const [key, list] of byDay) {
    if (list.length < 2 || list.length > MAX_DAY_ITEMS) continue;
    const first = list.reduce((a, b) => (GROUP_RANK[b.group] < GROUP_RANK[a.group] ? b : a));
    const flags = list
      .filter((i) => i.kind === 'hours' && typeof i.data.flags === 'string')
      .flatMap((i) => String(i.data.flags).split(','));
    const kinds = [...new Set(list.map((i) => i.kind as WorkDayKind))].filter((k) => k !== 'hours');
    days.push({
      key,
      subject: first.subject,
      space: list.find((i) => i.space)?.space ?? null,
      localDate: key.slice(key.lastIndexOf(':') + 1),
      timezone: zoneOf.get(key) ?? null,
      members: list.map((i) => ({ kind: i.kind as WorkDayKind, id: i.id })),
      approvable: list
        .filter((i) => i.canDecide && (DAY_APPROVABLE_KINDS as readonly string[]).includes(i.kind) && !i.step)
        .map((i) => ({ kind: i.kind as WorkDayKind, id: i.id })),
      labels: reviewLabels([...new Set(flags)]).map((l) => l.code),
      kinds,
      group: first.group,
      raisedAt:
        list
          .map((i) => i.raisedAt)
          .filter((v): v is string => !!v)
          .sort()[0] ?? null,
      canDecide: list.every((i) => i.canDecide),
    });
  }
  return days.sort((a, b) => GROUP_RANK[a.group] - GROUP_RANK[b.group] || a.localDate.localeCompare(b.localDate));
}

/** The inbox as the gateway answers it: the items, and the working days that group some of them. */
export interface ApprovalInbox extends ApprovalsResponse {
  /** Absent from an older gateway — then every item is shown on its own. */
  days?: ApprovalDay[];
}

/** "Approve day": what happened to each member, in order; the replay stops at the first refusal. */
export interface ApproveDayResult {
  complete: boolean;
  results: Array<ApprovalDayMember & { ok: boolean; code?: string; message?: string }>;
}
