/**
 * The home shift card's source, as the source-scanning specs read it.
 *
 * The card was one 954-line file; it is now `shift-clock-card.tsx` (state and
 * layout) plus `shift-clock/` (the writes, the caption, the hero, the discs,
 * the progress track, the refused banner). A guard that pinned "the card does
 * X" must keep reading ALL of it — reading only the entry file would let a
 * rule silently move out of its sight.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../..');

export const SHIFT_CARD = 'components/home/shift-clock-card.tsx';

/** Paths relative to `src/`, entry file first. */
export const SHIFT_CARD_FILES = [
  SHIFT_CARD,
  ...fs.readdirSync(path.join(SRC, 'components/home/shift-clock'))
    .filter((f) => /\.tsx?$/.test(f))
    .sort()
    .map((f) => `components/home/shift-clock/${f}`),
];

/** Every file of the card, read with the spec's own reader, as one text. */
export const shiftCard = (read: (p: string) => string) => SHIFT_CARD_FILES.map(read).join('\n');
