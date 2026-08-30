#!/usr/bin/env node
/**
 * Does every translation still fit the box it is rendered in?
 *
 * This class of bug is invisible in English by construction. The tiles on the
 * time-off screen were sized around "Pending"; German's "Ausstehend" is three
 * characters longer, and React Native cut it across two lines MID-WORD, because
 * a word wider than its box is simply chopped — there is no hyphenation to fall
 * back on. Nobody saw it until somebody switched language and looked.
 *
 * So the constrained slots are written down here with their real geometry, and
 * every language is measured against them. A slot is anything whose width is
 * decided by the layout rather than by the text: a tab in a bar of five, one
 * tile in a row of four, a button sharing a row with another button.
 *
 * Deliberately NOT a lint rule over the source. The thing that matters is the
 * arithmetic — characters against points — and that needs the numbers from the
 * stylesheet, which no amount of pattern-matching recovers.
 *
 *   node tools/i18n/check-slot-widths.mjs
 *
 * Exits non-zero when a label no longer fits, and prints how far over it is.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOCALES = ['en', 'de', 'es', 'fr', 'it'];

/**
 * The narrowest phone in real use. Anything that fits here fits everywhere,
 * and sizing for a 390pt screen is how a layout ships broken for the people on
 * the smaller one.
 */
const SCREEN = 375;

/**
 * Average glyph width as a fraction of the font size, mixed-case Latin text in
 * the system face. Measured against known-good and known-bad cases rather than
 * taken from a spec: 0.55 puts "Ausstehend" just over the old tile width, which
 * is exactly where the real break happened.
 */
const CHAR = 0.55;

/**
 * A slot is: how wide is one, how big is the text, and how many lines it may use.
 *
 * `lines: 1` means a single long WORD must fit outright. `lines: 2` means a
 * multi-word label may wrap — but the longest single word must still fit on one
 * line, because that is the one thing wrapping cannot help with.
 */
const SLOTS = [
  {
    name: 'bottom tab label',
    file: 'apps/mobile/app/(app)/(tabs)/_layout.tsx',
    // Five tabs across the full width, 2pt of padding each side of the label.
    width: SCREEN / 5 - 4,
    font: 11,
    lines: 1,
    /*
      The tab bar shrinks text to 70% before it clips — but 70% of 11pt is 8pt,
      which is not a label, it is a smudge. Shrinking is the emergency valve, not
      the design, so the budget is set at a scale that still reads and anything
      needing more is treated as too long. "Ferie e permessi" cleared the
      clipping floor and still looked wrong; every other language uses one word
      in this slot.
    */
    minScale: 0.85,
    keys: ['tabs.home', 'tabs.dashboard', 'tabs.tasks', 'tabs.createTask', 'tabs.manage',
           'tabs.attendance', 'tabs.timeOff', 'tabs.team', 'tabs.profile'],
  },
  {
    name: 'time-off stat tile',
    file: 'apps/mobile/app/(app)/(tabs)/time-off.tsx',
    // (375 − 2×16 outer − 3×4 gap) ÷ 4 − 2×8 card padding
    width: (SCREEN - 32 - 12) / 4 - 16,
    font: 11,
    lines: 2,
    keys: ['timeOff.stats.daysUsed', 'timeOff.stats.upcoming',
           'timeOff.stats.pending', 'timeOff.stats.rejected'],
  },
  {
    name: 'home stat tile',
    file: 'apps/mobile/src/components/home/home-styles.ts',
    // Two across: (375 − 2×16 outer − 12 gap) ÷ 2 − 2×12 card padding
    width: (SCREEN - 32 - 12) / 2 - 24,
    font: 12,
    lines: 2,
    keys: ['home.freelancer.todaysTasks', 'home.freelancer.urgentTasks',
           'home.freelancer.completed', 'home.freelancer.pending'],
  },
  {
    name: 'break-type button',
    file: 'apps/mobile/app/(app)/(tabs)/attendance.tsx',
    // Three across inside the shift card: (375 − 32 card − 2×8 gap) ÷ 3 − 2×8
    width: (SCREEN - 32 - 16) / 3 - 16,
    font: 11,
    lines: 2,
    keys: ['attendance.breaks.lunch', 'attendance.breaks.short', 'attendance.breaks.other'],
  },
  {
    name: 'paired decision button',
    file: 'apps/mobile/app/(app)/overtime/[id].tsx',
    // Two across, each carrying an icon: (375 − 32 − 12) ÷ 2 − icon 20 − gap 8
    width: (SCREEN - 32 - 12) / 2 - 28,
    font: 15,
    // Three lines is where a pair stops looking like a pair.
    lines: 3,
    keys: ['overtime.yes', 'overtime.no'],
  },
];

const dict = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(join(ROOT, 'apps/mobile/src/i18n/locales', `${l}.json`), 'utf8'))]),
);

const lookup = (d, key) => key.split('.').reduce((cur, part) => (cur && typeof cur === 'object' ? cur[part] : undefined), d);

/** Interpolations are not literal text — {{count}} renders as a number. */
const words = (s) => s.replace(/\{\{[^}]*\}\}/g, '').split(/\s+/).filter(Boolean);

const failures = [];
const notes = [];

for (const slot of SLOTS) {
  for (const key of slot.keys) {
    for (const lang of LOCALES) {
      const text = lookup(dict[lang], key);
      if (typeof text !== 'string') {
        notes.push(`missing  ${lang}  ${key}`);
        continue;
      }

      const scale = slot.minScale ?? 1;
      const budget = slot.width / (slot.font * CHAR * scale);

      // The longest word has to fit on one line whatever the wrapping allows.
      const longest = Math.max(0, ...words(text).map((w) => w.length));
      if (longest > budget) {
        failures.push(
          `${slot.name}: "${text}" (${lang}, ${key})\n` +
          `    longest word "${words(text).find((w) => w.length === longest)}" is ${longest} chars, ` +
          `slot holds ${budget.toFixed(1)}\n    ${slot.file}`,
        );
        continue;
      }

      // And the whole label has to fit in the lines it is allowed.
      const total = text.replace(/\{\{[^}]*\}\}/g, '00').length;
      if (total > budget * slot.lines) {
        failures.push(
          `${slot.name}: "${text}" (${lang}, ${key})\n` +
          `    needs ${(total / budget).toFixed(1)} lines, slot allows ${slot.lines}\n    ${slot.file}`,
        );
      }
    }
  }
}

const checked = SLOTS.reduce((n, s) => n + s.keys.length * LOCALES.length, 0);
if (notes.length) console.log(notes.map((n) => `  note: ${n}`).join('\n'));

if (failures.length) {
  console.error(`\n${failures.length} label(s) no longer fit their slot:\n`);
  console.error(failures.map((f) => `  ${f}`).join('\n\n'));
  console.error(`\nShorten the translation — a slot this narrow wants a word, not a sentence.\n`);
  process.exit(1);
}

console.log(`${checked} labels checked across ${SLOTS.length} constrained slots and ${LOCALES.length} languages — all fit.`);
