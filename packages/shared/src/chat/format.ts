/**
 * How chat writes times, days and presence, and how a bubble sits among its
 * neighbours — ONE copy for the web and the phone (each kept its own, and they
 * had started to drift: audit 2026-10-16). Pure: the app passes its language,
 * its 12/24-hour choice and its translator.
 */

/** The app's translator, as far as these helpers need it (i18next's `t` fits). */
export type ChatTranslate = (key: string, fallback: string) => string;

/** The active language as an IETF locale (every supported language). */
export function chatLocale(lang?: string | null): string {
  const l = lang || 'en';
  if (l.startsWith('de')) return 'de-DE';
  if (l.startsWith('es')) return 'es-ES';
  if (l.startsWith('it')) return 'it-IT';
  if (l.startsWith('fr')) return 'fr-FR';
  return 'en-US';
}

/** "18:32" (or "6:32 PM" when the member reads 12-hour time). */
export function chatTime(iso: string, lang: string, hour12?: boolean): string {
  return new Date(iso).toLocaleTimeString(chatLocale(lang), {
    hour: hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    ...(hour12 === undefined ? {} : { hour12 }),
  });
}

/** The local calendar day of an instant, as a comparable key. */
export function chatDayKey(iso: string): string {
  return new Date(iso).toDateString();
}

/** The line between days: "Today", "Yesterday", "Tue, 14 Oct". */
export function chatDayLabel(iso: string, lang: string, t: ChatTranslate): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return t('chat.today', 'Today');
  if (d.toDateString() === yest.toDateString()) return t('chat.yesterday', 'Yesterday');
  return d.toLocaleDateString(chatLocale(lang), { weekday: 'short', month: 'short', day: 'numeric' });
}

/** A conversation row's time: "09:41" today, "Yesterday", a weekday this week, a date before. */
export function chatWhenShort(iso: string, lang: string, hour12: boolean | undefined, t: ChatTranslate): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return chatTime(iso, lang, hour12);
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return t('chat.yesterday', 'Yesterday');
  if (now.getTime() - d.getTime() < 6 * 86_400_000) return d.toLocaleDateString(chatLocale(lang), { weekday: 'short' });
  return d.toLocaleDateString(chatLocale(lang), { day: 'numeric', month: 'short' });
}

/** "now", "5m", "3h", "2d", then a date. */
export function chatRelTime(iso: string | null, lang: string): string {
  if (!iso) return '';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return lang?.startsWith('de') ? 'jetzt' : 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(chatLocale(lang), { month: 'short', day: 'numeric' });
}

/** "Active now / Busy / Away / Offline". */
export function chatPresenceLabel(p: string | null | undefined, t: ChatTranslate): string {
  if (p === 'AVAILABLE') return t('chat.presence.active', 'Active now');
  if (p === 'BUSY') return t('chat.presence.busy', 'Busy');
  if (p === 'AWAY') return t('chat.presence.away', 'Away');
  return t('chat.presence.offline', 'Offline');
}

type BubbleMessage = { id?: string; senderId?: string; kind?: string | null; createdAt?: string | null };

/** Who a bubble belongs to for grouping — a system line is its own "person", so it stands alone. */
export const bubbleOwner = (m: BubbleMessage): string | undefined =>
  m.kind === 'SYSTEM' ? `system:${m.id}` : m.senderId;

/**
 * A bubble's shape from its neighbours: does a new day start here, does it join
 * the run above, is it the last of its run. `groupWithinMs` also breaks a run
 * after a pause (the web groups within 5 minutes; the phone by sender only).
 */
export function bubbleShape<M extends BubbleMessage>(
  list: readonly M[],
  i: number,
  who: (m: M) => string | undefined = bubbleOwner,
  opts: { groupWithinMs?: number } = {},
): { newDay: boolean; grouped: boolean; lastOfGroup: boolean } {
  const m = list[i]!;
  const prev = list[i - 1];
  const next = list[i + 1];
  const day = (x: M) => (x.createdAt ? chatDayKey(x.createdAt) : '');
  const at = (x: M) => (x.createdAt ? new Date(x.createdAt).getTime() : 0);
  const newDay = !prev || day(prev) !== day(m);
  const closeEnough = !prev || opts.groupWithinMs === undefined || at(m) - at(prev) < opts.groupWithinMs;
  return {
    newDay,
    grouped: !!prev && !newDay && who(prev) === who(m) && closeEnough,
    lastOfGroup: !next || who(next) !== who(m) || day(next) !== day(m),
  };
}
