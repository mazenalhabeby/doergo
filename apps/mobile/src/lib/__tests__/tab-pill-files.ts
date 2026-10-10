/**
 * The tab pill's source, as the source-scanning specs read it.
 *
 * `tab-pill.tsx` (the bar) plus `tab-pill/` (geometry, motion, one slot). A
 * guard that pinned "the pill does X" keeps reading ALL of it, so a rule
 * cannot move out of its sight by moving file.
 */
import * as fs from 'fs';
import * as path from 'path';

const AMAZEN = path.resolve(__dirname, '../../components/amazen');

export const TAB_PILL_FILES = [
  path.join(AMAZEN, 'tab-pill.tsx'),
  ...fs.readdirSync(path.join(AMAZEN, 'tab-pill'))
    .filter((f) => /\.tsx?$/.test(f))
    .sort()
    .map((f) => path.join(AMAZEN, 'tab-pill', f)),
];

/** Every file of the pill, read with the spec's own reader, as one text. */
export const tabPill = (read: (absPath: string) => string = (p) => fs.readFileSync(p, 'utf8')) =>
  TAB_PILL_FILES.map(read).join('\n');
