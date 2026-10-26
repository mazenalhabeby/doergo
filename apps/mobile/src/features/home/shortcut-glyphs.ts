import type React from 'react';
import type { GlyphProps } from '@/components/glyphs/glyphs';
import { libGlyph } from '@/components/amazen/ink-icon';
import { MANAGE_ROWS, MEMBER_ROWS } from '@/lib/manage-rows';

/**
 * Each destination's mark, keyed by the row's `labelKey` — the row's own `icon`, a name in the SHARED library
 * (the web's names for the same pages, 2026-10-26). Drawn flat in the colour the screen passes: the More rows
 * pass the accent, the home shortcuts the ink.
 *
 * ⚠️ The rows carry a NAME, never a drawing: `manage-rows.ts` is read by the tab bar, and a table that imports
 * every drawing in the app is how a require cycle turns into a black screen (components/amazen/index.ts).
 * ⚠️ Marks that sit side by side in one row of four differ in OUTLINE.
 */
export const SHORTCUT_GLYPHS: Record<string, React.ComponentType<GlyphProps>> = Object.fromEntries(
  [...MANAGE_ROWS, ...MEMBER_ROWS].map((row) => [row.labelKey, libGlyph(row.icon)]),
);
