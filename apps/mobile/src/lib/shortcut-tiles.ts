import type { Destination } from './manage-rows';

/**
 * Twenty-two destinations, four slots.
 *
 * Pure, and in `lib/` rather than in the rail, because the selection rule is
 * not rendering: it is the answer to "which four", and it is the part worth
 * testing. The rail draws what this returns.
 *
 * ⚠️ IT OWNS NO GATE. Every row arrives already filtered by
 * `homeDestinationsFor(user)`, which reads the same table the Manage tab and
 * the More sheet read. If the rail and the Manage list ever disagree about who
 * may open Clients, the bug is in `manage-rows.ts` and the fix belongs there —
 * that file records what the drift already cost: *"that is how a member comes
 * to see Clients on the web and not on the phone."*
 */

/** A count, or `undefined` when nothing on this screen already knows it. */
export interface BadgeCounts {
  [key: string]: number | undefined;
}

export const MAX_TILES = 4;
/** What a 26px mark needs, and the reason the tile is not elastic. */
export const TILE_SIZE = 71;
export const TILE_GAP = 9;

/**
 * ⚠️ ONLY STEP 2 MOVES DURING THE DAY.
 *
 * Badges come and go, so the first slots are live and the last two are stable —
 * which is the right way round for muscle memory: the thing you reach for
 * without looking never moves.
 *
 * ⚠️ A COUNT OF ZERO IS NOT A BADGE, and neither is an unknown one. A tile
 * whose count failed to load looks exactly like a tile with nothing waiting,
 * and that is correct: the rail must not invent a reason to worry. Never a
 * `?`, never a dot.
 */
export function chooseTiles(available: Destination[], counts: BadgeCounts): Destination[] {
  const badged: Destination[] = [];
  const plain: Destination[] = [];
  for (const d of available) {
    const n = d.badge ? counts[d.badge] : undefined;
    (n && n > 0 ? badged : plain).push(d);
  }
  /*
    Registry order within each group. A toolbar that reorders itself is a
    toolbar you cannot learn.

    ⚠️ NOT SORTED BY BADGE AGE YET. `README.md` step 5 puts that last and says
    why: it is the only part that makes the rail move during the day, and it is
    worth watching the static version first. Stopping here is the documented
    stopping point, not an omission.
  */
  return [...badged, ...plain].slice(0, MAX_TILES);
}
