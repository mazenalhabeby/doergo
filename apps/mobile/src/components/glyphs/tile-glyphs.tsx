import React from 'react';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
// ⚠️ Resolves once this file is MOVED to apps/mobile/src/components/home/.
// It will not compile in the handoff folder — deliberately, so there is
// nothing to edit after the move.
import type { GlyphProps } from './glyphs';

/**
 * The tile and destination marks.
 *
 * Same construction as the rest of the family: ONE hue at four opacities
 * (.18 behind, .34 body, .55 detail, .95 the thing that names it), with the
 * detail PUNCHED out of the solid mark in `contrast`.
 *
 * ⚠️ `contrast` is the SURFACE, not a colour choice. On a tile that is the
 * composited value of `tile` over the card — not the card's own colour. A
 * wrong value does not error; it draws a grey ghost across the shape.
 *
 * ⚠️ These sit at 26px on a 71px tile, with a LABEL under them. That is the
 * largest any glyph in this app is drawn, and it is also the only place a
 * glyph is the sole content of a control — so silhouette matters more here
 * than anywhere else. Each one differs in outline, not only in detail.
 *
 * ⚠️ NOT HERE, ON PURPOSE — these already exist in `glyphs.tsx` and the rail
 * uses those: `MessagesGlyph` (two bubbles, the near one solid),
 * `SendDocumentGlyph`, `SupportGlyph` (a life ring), `DocumentsGlyph`,
 * `EquipmentGlyph`. A family with two marks for one thing is not a family.
 *
 * `ExpenseQueueGlyph` (Log expense) lives in `queue-glyphs.tsx`.
 */

const svg = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24' });

/**
 * TWO ARCS CHASING EACH OTHER.
 *
 * The leading arc at .95, the trailing one at .45, so the mark has a
 * direction standing still. Solid arrowheads rather than stroked caps —
 * a stroked chevron disappears at this weight.
 */
export function SyncGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path
        d="M20.6 12a8.6 8.6 0 0 1-8.6 8.6 8.6 8.6 0 0 1-7.4-4.2"
        fill="none"
        stroke={color}
        strokeOpacity={0.95}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Path
        d="M3.4 12A8.6 8.6 0 0 1 12 3.4a8.6 8.6 0 0 1 7.4 4.2"
        fill="none"
        stroke={color}
        strokeOpacity={0.45}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Path d="M20.4 2.6v5.6h-5.6Z" fill={color} fillOpacity={0.95} />
      <Path d="M3.6 21.4v-5.6h5.6Z" fill={color} fillOpacity={0.95} />
    </Svg>
  );
}

/** A JOB BEING MADE. The card behind at .22 is the list it joins. */
export function NewJobGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={6.4} y={1.6} width={15.2} height={15.2} rx={3.4} fill={color} fillOpacity={0.22} />
      <Rect x={2.4} y={5.6} width={15.2} height={15.2} rx={3.4} fill={color} fillOpacity={0.95} />
      <Path
        d="M10 9.4v7.6M6.2 13.2h7.6"
        fill="none"
        stroke={contrast}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * BRACKETS CLOSING ON A CARD.
 *
 * The card sits at .38 and the brackets at .95: the act is the subject, not
 * the object. The scan line across the middle is what makes it read as
 * capture rather than as a frame.
 */
export function ScanCardGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={6.4} y={8.4} width={11.2} height={7.2} rx={1.8} fill={color} fillOpacity={0.38} />
      <Path d="M2.4 8V4.8a2.4 2.4 0 0 1 2.4-2.4H8" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M16 2.4h3.2a2.4 2.4 0 0 1 2.4 2.4V8" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M21.6 16v3.2a2.4 2.4 0 0 1-2.4 2.4H16" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M8 21.6H4.8a2.4 2.4 0 0 1-2.4-2.4V16" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M2.4 12h19.2" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
/**
 * A CONTACT BEING ADDED.
 *
 * The landscape card separates it from `JoinQueueGlyph`, which is a person
 * asking to join the organization. This one is a client record. Same plus,
 * different claim — and they must never be swapped.
 */
export function AddClientGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={1.8} y={3.6} width={20.4} height={16.8} rx={3.4} fill={color} fillOpacity={0.95} />
      <Circle cx={8} cy={10.4} r={2.8} fill={contrast} />
      <Path d="M3.8 16.8c.8-2 2.4-3 4.2-3s3.4 1 4.2 3Z" fill={contrast} />
      <Path
        d="M17 8.4v6.6M13.7 11.7h6.6"
        fill="none"
        stroke={contrast}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/* ── Destinations that had no mark anywhere in the app ─────────────────────── */

/**
 * ★ A TOOLBOX.
 *
 * §3.12 is *what I hold* — gated on custody rather than a permission: *"the
 * filter IS the authorization, which is why `GET /assets/mine` carries none."*
 *
 * THREE elements and no more: the handle at .55 (a case you carry is a case
 * you were given), the body at .95, and two punched details — the band and
 * the latch.
 *
 * ⚠️ `glyphs.tsx` has `EquipmentGlyph`, which is a different claim: equipment
 * as a category. This one is a container with a handle, and containers with
 * handles belong to somebody. Two marks, two meanings — do not merge them.
 *
 * ⚠️ Earlier drafts that failed, and why, because the same mistakes are easy
 * to make again:
 *
 *   a ghost case at .20 behind a body, a handle and a punched tag — four
 *   elements at four depths in one 24px square. The ghost broke the
 *   silhouette and the punched rectangle read as a window, not a label.
 *
 *   an asset tag alone — clean, but it reads as a price tag, and a price tag
 *   in a work app is wrong before anybody has thought about it.
 *
 * Three elements is the ceiling in this family, and the object has to be the
 * thing the reader already has a word for.
 *
 * ⚠️ §3.13 *What I spent* is gated on the same custody and uses the receipt
 * mark, not this one. One mark, one claim.
 */
export function MyEquipmentGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path
        d="M8.2 6.2V5a2.6 2.6 0 0 1 2.6-2.6h2.4A2.6 2.6 0 0 1 15.8 5v1.2"
        fill="none"
        stroke={color}
        strokeOpacity={0.55}
        strokeWidth={2.3}
        strokeLinecap="round"
      />
      <Rect x={1.6} y={6.2} width={20.8} height={15} rx={3.2} fill={color} fillOpacity={0.95} />
      <Path d="M1.6 11.4h20.8" fill="none" stroke={contrast} strokeWidth={1.7} />
      <Rect x={9.4} y={13.6} width={5.2} height={4.2} rx={1.4} fill={contrast} />
    </Svg>
  );
}

/**
 * THE CLIPBOARD, WITH THE ENTRY THAT WAS ACCEPTED.
 *
 * `MyEquipmentGlyph` is the things; this is the record of what happened to
 * them. The accepted disc is bitten out of the board so the two forms are one
 * object — the same construction as `SendDocGlyph`'s arrow.
 */
export function EquipmentLogGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={2.6} y={3} width={15.4} height={18.4} rx={2.8} fill={color} fillOpacity={0.95} />
      <Rect x={7} y={1.4} width={6.6} height={3.6} rx={1.6} fill={color} fillOpacity={0.55} />
      <Path
        d="M6 9.4h7.2M6 13h7.2M6 16.6h4.2"
        fill="none"
        stroke={contrast}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
      <Circle cx={18.6} cy={17.4} r={4.6} fill={contrast} />
      <Circle cx={18.6} cy={17.4} r={3.6} fill={color} fillOpacity={0.95} />
      <Path
        d="m17 17.4 1.2 1.2 2.2-2.4"
        fill="none"
        stroke={contrast}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * A PAGE, AND YOUR NAME RUNNING OFF THE BOTTOM OF IT.
 *
 * The signature is the only element allowed outside the page's bounds, which
 * is what tells it apart from `DocumentsGlyph` at a glance. A signature that
 * fitted neatly inside would read as another ruled line.
 */
export function SignGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path d="M4 2.6h8.4l5.6 5.4v9.2H4Z" fill={color} fillOpacity={0.95} />
      <Path d="M12.4 2.6v5.4H18Z" fill={contrast} />
      <Path d="M6.8 11.6h7.4M6.8 14.4h4.6" fill="none" stroke={contrast} strokeWidth={1.6} strokeLinecap="round" />
      <Path
        d="M2.4 20.6c2.6-3.4 4.2-3.4 5.4-1.2s2.8 2 4.2-1.4 3.4-2.6 4.6-.6 2.8 1.6 4.8-.8"
        fill="none"
        stroke={color}
        strokeOpacity={0.95}
        strokeWidth={2.1}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * THE HOUR SOLID, AND THE PART PAST IT DRAWN ROUND THE OUTSIDE.
 *
 * Same idea as the crew card's overrun ring, at tile size: a full disc for
 * the shift, and an arc outside its rim for the time beyond. The .34 track
 * runs most of the way round; the .95 segment is the overrun.
 *
 * ⚠️ §3.20 has two faces — mine to sign, versus mine to approve. This mark
 * serves both, because both are about the same extra hour.
 */
export function OvertimeGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path
        d="M12 1.4a10.6 10.6 0 1 1 0 21.2"
        fill="none"
        stroke={color}
        strokeOpacity={0.34}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <Circle cx={12} cy={12} r={8.4} fill={color} fillOpacity={0.95} />
      <Path d="M12 6.8V12l3.4 2.2" fill="none" stroke={contrast} strokeWidth={2.1} strokeLinecap="round" />
      <Path
        d="M12 1.4a10.6 10.6 0 0 1 7.5 3.1"
        fill="none"
        stroke={color}
        strokeOpacity={0.95}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * A SET, NOT A PERSON.
 *
 * The second figure at .34 behind the first. `OnClockGlyph` is one person
 * doing something; this is the roll.
 */
export function MembersGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={17.2} cy={7.4} r={3.6} fill={color} fillOpacity={0.34} />
      <Path
        d="M17.2 12.4c-3 0-5.4 2.2-5.4 5v1.8h10.8v-1.8c0-2.8-2.4-5-5.4-5Z"
        fill={color}
        fillOpacity={0.34}
      />
      <Circle cx={9} cy={6.6} r={4.4} fill={color} fillOpacity={0.95} />
      <Path
        d="M9 12.8c-3.6 0-6.6 2.8-6.6 6.2v2.2h13.2v-2.2c0-3.4-3-6.2-6.6-6.2Z"
        fill={color}
        fillOpacity={0.95}
      />
    </Svg>
  );
}

/** SEALED. An open flap would say "received"; these are ones you sent. */
export function InvitationsGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={1.8} y={4.4} width={20.4} height={15.2} rx={3} fill={color} fillOpacity={0.95} />
      <Path
        d="M3.6 6.8 12 13l8.4-6.2"
        fill="none"
        stroke={contrast}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * A WEEK WITH SHIFT BARS PUNCHED OUT OF IT.
 *
 * The app's `WeekGlyph` is a calendar you read; this is a rota you set — four
 * bars of unequal height, which is what a schedule looks like and a calendar
 * never does.
 */
export function SchedulesGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={1.8} y={3.4} width={20.4} height={17.2} rx={3.2} fill={color} fillOpacity={0.95} />
      <Path d="M1.8 8.2h20.4" fill="none" stroke={contrast} strokeWidth={1.5} />
      <Rect x={4.6} y={10.6} width={3} height={7.4} rx={1.4} fill={contrast} />
      <Rect x={9} y={12.6} width={3} height={5.4} rx={1.4} fill={contrast} />
      <Rect x={13.4} y={10.6} width={3} height={7.4} rx={1.4} fill={contrast} />
      <Rect x={17.8} y={14.4} width={3} height={3.6} rx={1.4} fill={contrast} />
    </Svg>
  );
}

/**
 * A BOOK OF THEM, NOT ONE OF THEM.
 *
 * ⚠️ `AddClientGlyph` is ONE card with a plus. This is the list. And neither
 * is `JoinQueueGlyph`, which is a person asking to join the organization —
 * a colleague, not a record. Three plus-shaped ideas, three marks, never
 * swapped.
 */
export function ClientsGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={5.4} y={2.4} width={16.2} height={12.4} rx={2.8} fill={color} fillOpacity={0.26} />
      <Rect x={2.4} y={6.8} width={16.2} height={14.4} rx={2.8} fill={color} fillOpacity={0.95} />
      <Circle cx={7.8} cy={12.2} r={2.4} fill={contrast} />
      <Path d="M4.4 17.6c.7-1.8 2-2.7 3.4-2.7s2.7.9 3.4 2.7Z" fill={contrast} />
      <Path d="M12.8 11.4h3.6M12.8 14.4h3.6" fill="none" stroke={contrast} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}
