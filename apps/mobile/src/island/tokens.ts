/**
 * THE ISLAND'S OWN COLOURS — ⚠️ AND THEY ARE NOT THE THEME'S.
 *
 * ⚠️ THE ISLAND IS BLACK IN BOTH THEMES, AND SO IS ITS INK. It is pretending
 * to be the camera housing, and the housing is black on a white phone too. A
 * white pill in light mode is just a toast again, which is the thing this
 * replaces. This is the single decision the whole idea rests on — ⚠️ never
 * wire any of it to `useTheme()`.
 *
 * Everything BEHIND it keeps using `theme/amazen.ts` as normal.
 */
export const ISLAND = {
  bg: '#000000',
  ink: '#f1f6fa',
  dim: '#8b969d',
  line: '#ffffff1a',
  /** ⚠️ Dark-mode jade, in BOTH themes. */
  acc: '#66dbba',
  warn: '#f2b263',
  crit: '#fd978c',
} as const;

/**
 * THE FOUR TONES, AND ONLY THESE.
 *
 * ⚠️ `queued` IS NOT `failed`. This app has an outbox; "queued" is a fact, not
 * a failure, and colouring it red teaches members that working offline is
 * broken — which is the opposite of what the outbox is for.
 */
export type Tone = 'done' | 'waiting' | 'failed' | 'queued';

export interface ToneLook {
  /** The accent for the icon and any ring. */
  fg: string;
  /** ⚠️ Mono for `queued`, because the thing being counted is a queue. */
  mono: boolean;
  /** ms before it sinks. ⚠️ Every notification closes on its own. */
  dwell: number;
}

/**
 * ⚠️ NOTHING STAYS. Every notification shows for a few seconds and closes —
 * 3s, 4s with an action, 5s for a failure so it can be read.
 */
export const TONES: Record<Tone, ToneLook> = {
  done: { fg: ISLAND.acc, mono: false, dwell: 3000 },
  waiting: { fg: ISLAND.warn, mono: false, dwell: 3000 },
  failed: { fg: ISLAND.crit, mono: false, dwell: 5000 },
  queued: { fg: ISLAND.dim, mono: true, dwell: 3000 },
};

/** 4s when there is something to press — §10. */
export function dwellFor(tone: Tone, hasAction: boolean): number {
  return Math.max(TONES[tone].dwell, hasAction ? 4000 : 0);
}

/**
 * ⚠️ WITH A SCREEN READER, NOTHING AUTO-DISMISSES INSIDE 6s (WCAG 2.2.1).
 * Three seconds is not enough to hear a sentence read out and act on it.
 */
export const SCREEN_READER_MIN_DWELL = 6000;
