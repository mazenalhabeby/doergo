import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';
// ⚠️ Resolves once this file is MOVED to apps/mobile/src/components/home/.
// It will not compile in the handoff folder — deliberately, so there is
// nothing to edit after the move.
import type { GlyphProps } from './glyphs';

/**
 * The documents reminder's marks.
 *
 * All four are ONE SHEET WITH A BADGE — the construction `SendDocumentGlyph`
 * already established in `glyphs.tsx`: *"ONE sheet with a rising badge — same
 * construction as Documents, no confusing them."* The sheet is constant; the
 * disc bitten out of its corner is the whole difference.
 *
 * That is deliberate. These four never appear together — the row shows exactly
 * one — so they do NOT need to differ in silhouette. What they need is to look
 * like the same object in four conditions, because they are.
 *
 * ⚠️ NOT HERE, ON PURPOSE:
 *   `SignGlyph` (tile-glyphs.tsx) is the "sign your own" mark. Reused.
 *   `DocumentsGlyph` (glyphs.tsx) is the screen's own mark. Reused.
 *   `BlockedGlyph` (glyphs.tsx) is a circle with a bar — a status, not a
 *   document. `DocBlockedGlyph` below is a different claim and both stay.
 */

const svg = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24' });

/** The sheet every mark in this file is built on. */
function Sheet({ color, contrast, short = false }: { color: string; contrast: string; short?: boolean }) {
  return (
    <>
      <Path d={short ? 'M4 2.6h8.4L18 8v9H4Z' : 'M4 2.6h8.4L18 8v13.4H4Z'} fill={color} fillOpacity={0.95} />
      <Path d="M12.4 2.6V8H18Z" fill={contrast} />
      <Path
        d="M6.8 12h5.4M6.8 15.4h3.4"
        fill="none"
        stroke={contrast}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
    </>
  );
}

/** The badge disc, bitten out of the sheet so the two forms read as one. */
function Badge({ color, contrast, children }: { color: string; contrast: string; children: React.ReactNode }) {
  return (
    <>
      <Circle cx={18} cy={17.6} r={5.4} fill={contrast} />
      <Circle cx={18} cy={17.6} r={4.4} fill={color} fillOpacity={0.95} />
      {children}
    </>
  );
}

/** A PLUS. Not sent yet. */
export function DocNeededGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Sheet color={color} contrast={contrast} />
      <Badge color={color} contrast={contrast}>
        <Path d="M18 15.2v4.8M15.6 17.6h4.8" fill="none" stroke={contrast} strokeWidth={1.8} strokeLinecap="round" />
      </Badge>
    </Svg>
  );
}

/** AN HOUR HAND. Held, and running out. */
export function DocExpiringGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Sheet color={color} contrast={contrast} />
      <Badge color={color} contrast={contrast}>
        <Path d="M18 15v2.6l1.8 1.2" fill="none" stroke={contrast} strokeWidth={1.6} strokeLinecap="round" />
      </Badge>
    </Svg>
  );
}

/**
 * A CROSS. Sent, and refused.
 *
 * ⚠️ This state does not reach the widget today — `summarisePending()` takes
 * `{ toUpload, toSign, expiring }` and `REJECTED` is not one of its inputs.
 * See the folder's FINDINGS §1. Drawing the mark first is deliberate: the row
 * cannot say "sent back" until somebody passes the state through, and this is
 * what it will need when they do.
 */
export function DocSentBackGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Sheet color={color} contrast={contrast} />
      <Badge color={color} contrast={contrast}>
        <Path
          d="M20.2 15.6 15.8 20M15.8 15.6l4.4 4.4"
          fill="none"
          stroke={contrast}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      </Badge>
    </Svg>
  );
}

/**
 * AN EXCLAMATION. Missing, and stopping work.
 *
 * `blocksWork` on any single requirement makes the whole row crit, whatever
 * the headline says — so this mark and the `crit` tone always travel together.
 *
 * ⚠️ `glyphs.tsx` has `BlockedGlyph`: a circle with a bar, which is a *status*
 * applied to a job. This is a *document* that blocks. Both stay.
 */
export function DocBlockedGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Sheet color={color} contrast={contrast} />
      <Badge color={color} contrast={contrast}>
        <Path d="M18 15.2v2.6" fill="none" stroke={contrast} strokeWidth={1.9} strokeLinecap="round" />
        <Circle cx={18} cy={19.9} r={1} fill={contrast} />
      </Badge>
    </Svg>
  );
}

/**
 * TWO SHEETS AND A FIGURE — somebody else's document, waiting on you.
 *
 * The only mark in this file that breaks the one-sheet construction, because
 * it is the only one that is not about a document of yours. The second sheet
 * at .34 behind is theirs; the figure punched into the front one is whose.
 *
 * ⚠️ `toSign[].forMember` carries this and `summarisePending()` drops it — see
 * FINDINGS §2. Signing your own contract and unblocking a colleague are not
 * the same errand and should not share a mark.
 */
export function CountersignGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path d="M9.4 1.8h7L21 6v11.6H9.4Z" fill={color} fillOpacity={0.34} />
      <Path d="M16.4 1.8V6H21Z" fill={contrast} />
      <Path d="M3.2 6.4h7L14.8 11v11.2H3.2Z" fill={color} fillOpacity={0.95} />
      <Path d="M10.2 6.4V11h4.6Z" fill={contrast} />
      <Circle cx={8} cy={14.6} r={2.2} fill={contrast} />
      <Path d="M5 19.6c.6-1.6 1.7-2.4 3-2.4s2.4.8 3 2.4Z" fill={contrast} />
    </Svg>
  );
}
