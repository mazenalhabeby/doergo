import type { BadgeSource, Destination } from '../lib/manage-rows';

/**
 * ⭐ THE SHORTCUTS CARD'S RULES — `docs/design/shortcuts`.
 *
 * The card is a VIEW of the destination table (`manage-rows.ts`): every tile
 * is a row the member may open, so a tile can never lead to a screen that
 * refuses them. The member chooses four; until they do, the card chooses for
 * them (the smart picks). A tile is identified by its row's `labelKey`.
 */

export const SLOTS = 4;
/** Fewer than this and the card is not drawn — one tile is a button, not a widget. */
export const MIN_TILES = 2;

export type Badges = Partial<Record<BadgeSource, number>>;

/** Everything the member may put on the card. A route that opens a sheet is not a place a tile can go. */
export function shortcutCandidates(rows: Destination[]): Destination[] {
  const seen = new Set<string>();
  return rows.filter((r) => !r.route.startsWith('sheet:') && !seen.has(r.labelKey) && (seen.add(r.labelKey), true));
}

export const badgeOf = (r: Destination, badges: Badges): number => (r.badge ? badges[r.badge] ?? 0 : 0);

/**
 * The four the card picks when the member has not chosen.
 *
 *   1. what is waiting, most first — a door with a number beats a plain verb;
 *   2. then the actions, in table order — stable, so they can be learned;
 *   3. then the member's own places, in table order.
 */
export function smartPicks(cands: Destination[], badges: Badges): string[] {
  const waiting = cands.filter((r) => badgeOf(r, badges) > 0).sort((a, b) => badgeOf(b, badges) - badgeOf(a, badges));
  const acts = cands.filter((r) => r.act);
  const places = cands.filter((r) => r.home && !r.act);
  const out: string[] = [];
  for (const r of [...waiting, ...acts, ...places]) {
    if (out.length === SLOTS) break;
    if (!out.includes(r.labelKey)) out.push(r.labelKey);
  }
  return out;
}

/**
 * What the card shows: the member's four, in THEIR order — tiles stop moving
 * once chosen, so the thumb learns them. A chosen tile they can no longer open
 * (a role changed) is dropped, and its slot refills from the smart picks.
 * Never chosen → the smart picks, live.
 */
export function shownShortcuts(chosen: string[] | null, cands: Destination[], badges: Badges): Destination[] {
  const by = new Map(cands.map((r) => [r.labelKey, r]));
  const smart = smartPicks(cands, badges);
  if (!chosen) return smart.map((k) => by.get(k)!);
  const keep = chosen.filter((k) => by.has(k)).slice(0, SLOTS);
  for (const k of smart) if (keep.length < Math.min(SLOTS, chosen.length) && !keep.includes(k)) keep.push(k);
  return keep.map((k) => by.get(k)!);
}

export type ShortcutGroup = 'waiting' | 'do' | 'go' | 'manage';

/** The editor's sections. */
export function groupOf(r: Destination, badges: Badges): ShortcutGroup {
  if (badgeOf(r, badges) > 0) return 'waiting';
  if (r.act) return 'do';
  if (r.manage) return 'manage';
  return 'go';
}
