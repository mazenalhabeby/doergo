/**
 * Chat rules asked by the server AND both apps, so a button is only offered
 * when the server will accept it.
 */
import type { ChatConversation, ChatMessage } from './types';

/** At most this many files in one message. */
export const CHAT_MAX_ATTACHMENTS = 5;

/** A list row / push line for a message: its words, or the first file's name. */
export function messagePreview(
  body: string | null | undefined,
  attachments?: ReadonlyArray<{ fileName?: string }> | null,
): string {
  const text = (body ?? '').trim();
  if (text) return text;
  return attachments?.[0]?.fileName ?? '';
}

/** Your own message may be changed or removed for this long after it was sent. */
export const CHAT_EDIT_WINDOW_MINUTES = 15;

/** May `userId` still edit or remove `msg` at `now`? Own, not removed, inside the window. */
export function mayChangeMessage(
  msg: Pick<ChatMessage, 'senderId' | 'createdAt' | 'deletedAt'>,
  userId: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!userId || msg.senderId !== userId || msg.deletedAt) return false;
  const sent = Date.parse(msg.createdAt);
  return Number.isFinite(sent) && now.getTime() - sent <= CHAT_EDIT_WINDOW_MINUTES * 60_000;
}

/** A page cursor for older history: the oldest message on screen, as "createdAt|id". */
export function historyCursor(oldest: Pick<ChatMessage, 'createdAt' | 'id'> | null | undefined): string | undefined {
  return oldest ? `${oldest.createdAt}|${oldest.id}` : undefined;
}

/** Read a history cursor back; a bare ISO date (older clients) is accepted. Null when unusable. */
export function parseHistoryCursor(raw: unknown): { at: Date; id: string | null } | null {
  if (typeof raw !== 'string' || !raw) return null;
  const [iso, id] = raw.split('|');
  const at = new Date(iso ?? '');
  if (Number.isNaN(at.getTime())) return null;
  return { at, id: id && /^[\w-]{1,64}$/.test(id) ? id : null };
}

/**
 * "Read" for my message: has every other member read up to it?
 * DIRECT: the other person's last read. GROUP: how many of the others have.
 */
export function readState(
  conv: Pick<ChatConversation, 'readAt'>,
  msg: Pick<ChatMessage, 'createdAt' | 'senderId'>,
): { readBy: number; of: number } {
  const others = Object.entries(conv.readAt ?? {}).filter(([uid]) => uid !== msg.senderId);
  const at = Date.parse(msg.createdAt);
  const readBy = others.filter(([, r]) => !!r && Date.parse(r) >= at).length;
  return { readBy, of: others.length };
}

// ── Groups (docs/plans/chat-team.md phase 3) ─────────────────────────────────

/** A group's name, at most this long. */
export const CHAT_GROUP_TITLE_MAX = 80;
/** At most this many people in one group, the creator included. */
export const CHAT_GROUP_MAX_MEMBERS = 50;

/** A group name as stored: trimmed, inner whitespace collapsed. Null when empty or too long. */
export function parseGroupTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const title = raw.replace(/\s+/g, ' ').trim();
  return title && title.length <= CHAT_GROUP_TITLE_MAX ? title : null;
}

/**
 * May this person rename a group and add or remove its people? Its creator, or
 * somebody who manages people org-wide. Leaving is everybody's.
 */
export function mayManageGroup(
  conv: { type: string; createdById?: string | null },
  userId: string | null | undefined,
  managesPeople: boolean,
): boolean {
  if (!userId || conv.type !== 'GROUP') return false;
  return conv.createdById === userId || managesPeople;
}

// ── Search ───────────────────────────────────────────────────────────────────

/** Words in one search, at most; each at most this long. */
export const CHAT_SEARCH_MAX_WORDS = 8;
const CHAT_SEARCH_WORD_MAX = 40;

/**
 * Typed words → a Postgres tsquery for the 'simple' configuration: every word
 * must appear, each as a prefix ("rep" finds "repair"). Only letters and digits
 * survive — in any script — so nothing typed can reach tsquery's own syntax.
 * Null when nothing searchable is left.
 */
export function chatSearchQuery(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const words = (raw.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .map((w) => w.slice(0, CHAT_SEARCH_WORD_MAX))
    .slice(0, CHAT_SEARCH_MAX_WORDS);
  return words.length ? words.map((w) => `${w}:*`).join(' & ') : null;
}

// ── System lines ─────────────────────────────────────────────────────────────

/**
 * A SYSTEM line as a translation key + its values. Both apps call this and
 * translate `chat.system.<key>`, so the words live in each app's catalogue.
 * "you" replaces the reader's own name.
 */
export function chatSystemLine(
  meta:
    | {
        event: string;
        actor?: { id: string; name: string };
        users?: { id: string; name: string }[];
        title?: string | null;
      }
    | null
    | undefined,
  viewerId: string | null | undefined,
  youLabel: string,
): { key: string; values: Record<string, string> } | null {
  if (!meta?.actor) return null;
  const name = (p: { id: string; name: string }) => (p.id === viewerId ? youLabel : p.name);
  const values = {
    actor: name(meta.actor),
    users: (meta.users ?? []).map(name).join(', '),
    title: meta.title ?? '',
  };
  switch (meta.event) {
    case 'CREATED':
    case 'RENAMED':
    case 'ADDED':
    case 'REMOVED':
    case 'LEFT':
      return { key: meta.event.toLowerCase(), values };
    default:
      return null;
  }
}

// ── A job's chat ─────────────────────────────────────────────────────────────

/**
 * Is a job's chat closed to new messages? When the job is over — finished or
 * cancelled: a custom flow's isFinal/isCanceled step, else the canonical
 * COMPLETED / CLOSED / CANCELED. The history stays readable.
 */
export function taskChatClosed(
  status: string | null | undefined,
  statuses: ReadonlyArray<{ key: string; isFinal?: boolean | null; isCanceled?: boolean | null }> | null | undefined,
): boolean {
  if (!status) return false;
  if (statuses && statuses.length) return statuses.some((s) => s.key === status && (!!s.isFinal || !!s.isCanceled));
  return status === 'COMPLETED' || status === 'CLOSED' || status === 'CANCELED';
}

/** Refusal codes the apps translate (`chat.errors.<code>`). */
export const CHAT_CODES = {
  TASK_CLOSED: 'CHAT_TASK_CLOSED',
  GROUP_TITLE: 'CHAT_GROUP_TITLE',
  GROUP_TOO_BIG: 'CHAT_GROUP_TOO_BIG',
  GROUP_NOT_ALLOWED: 'CHAT_GROUP_NOT_ALLOWED',
  GROUP_UNREACHABLE: 'CHAT_GROUP_UNREACHABLE',
  SEARCH_EMPTY: 'CHAT_SEARCH_EMPTY',
} as const;
