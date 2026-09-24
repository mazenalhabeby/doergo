/**
 * Moving a widget up or down, and what the sheet says about it.
 *
 * ⚠️ A LIST WITH ARROWS, NEVER A DRAG CANVAS.
 *
 * A drag canvas is the obvious build and it is the wrong one on a phone: it
 * needs a gesture that competes with the scroll, it has no keyboard or screen
 * reader story, and the thing you are moving is under your thumb while you
 * decide where to put it. Two arrows say the same thing, land in one tap, and
 * can be read aloud.
 *
 * Pure, so the arithmetic is testable — the drag version's bugs were all in
 * the arithmetic and none of them were visible in review.
 */

export interface ArrangeLayout {
  /** Every key the member has, in order — including the ones switched off. */
  keys: string[];
  /** ⚠️ Switched off, NEVER deleted. Un-hiding restores the original place. */
  hidden: string[];
}

/** What just happened, for the 30 seconds it is worth saying so. */
export interface Moved {
  key: string;
  direction: 'up' | 'down';
  /** The position it held before, 1-based — `MOVED UP · WAS 3`. */
  wasAt: number;
}

/** The keys actually on the home, in order. */
export function onHome(layout: ArrangeLayout): string[] {
  return layout.keys.filter((k) => !layout.hidden.includes(k));
}

export function offHome(layout: ArrangeLayout, available: string[]): string[] {
  return available.filter((k) => layout.hidden.includes(k) || !layout.keys.includes(k));
}

/**
 * Swap a visible widget with its visible neighbour.
 *
 * ⚠️ THE HIDDEN KEYS KEEP THEIR PLACES. The member is reordering what they can
 * SEE; the stored list also holds keys they cannot — switched off, or removed
 * by entitlement since. The visible keys are written back into the slots they
 * already occupied, so nothing invisible is shuffled by a gesture about
 * something else, and switching one back on returns it where it was.
 */
export function move(
  layout: ArrangeLayout,
  key: string,
  direction: 'up' | 'down',
): { layout: ArrangeLayout; moved: Moved | null } {
  const visible = onHome(layout);
  const from = visible.indexOf(key);
  const to = direction === 'up' ? from - 1 : from + 1;

  /*
    ⚠️ NOTHING MOVES AND NOTHING REFLOWS at either end. The first row has no up
    arrow and the last no down — dimmed to 35%, NOT removed, so the row keeps
    its shape. A control that disappears makes the row jump under the finger
    that was about to press the other one.
  */
  if (from < 0 || to < 0 || to >= visible.length) return { layout, moved: null };

  const reordered = [...visible];
  [reordered[from], reordered[to]] = [reordered[to]!, reordered[from]!];

  let i = 0;
  const keys = layout.keys.map((k) => (visible.includes(k) ? reordered[i++]! : k));
  return {
    layout: { ...layout, keys },
    moved: { key, direction, wasAt: from + 1 },
  };
}

/** Switch one off. It stays in `keys`, so its place is waiting for it. */
export function hide(layout: ArrangeLayout, key: string): ArrangeLayout {
  if (layout.hidden.includes(key)) return layout;
  return { keys: layout.keys, hidden: [...layout.hidden, key] };
}

/** Switch one back on, into the place it always had. */
export function show(layout: ArrangeLayout, key: string): ArrangeLayout {
  return {
    // A key the member never had is appended; one they hid is already in place.
    keys: layout.keys.includes(key) ? layout.keys : [...layout.keys, key],
    hidden: layout.hidden.filter((k) => k !== key),
  };
}

/** `↑` is dead on the first row, `↓` on the last. Dimmed, never removed. */
export function canMove(index: number, count: number) {
  return { up: index > 0, down: index < count - 1 };
}

/** How long the UNDO line and the moved row's outline stay. */
export const UNDO_MS = 30_000;
