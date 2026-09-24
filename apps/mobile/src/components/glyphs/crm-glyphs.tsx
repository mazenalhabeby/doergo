import React from 'react';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
// ⚠️ Resolves once this file is MOVED to apps/mobile/src/components/home/.
// It will not compile in the handoff folder — deliberately, so there is
// nothing to edit after the move.
import type { GlyphProps } from './glyphs';

/**
 * The clients card's marks.
 *
 * ⚠️ REUSED, NOT REDRAWN — two of this card's marks already exist and both
 * carry exactly the right claim:
 *
 *   `CallGlyph`   (work-glyphs.tsx) — the jade disc on a CALL reminder. It is
 *                 the ACT of ringing somebody, which is what the disc does.
 *   `FinishGlyph` (work-glyphs.tsx) — the Done tick. "This is complete" is one
 *                 claim and it already has a mark.
 *
 * ⚠️ And note what that means for the card: the row's *reason* — a call, an
 * email, something else — is TEXT, never an icon. `reminder.ts` is explicit
 * that `reminderKind: 'CALL'` (an intent) and `type: 'CALL'` (a record) are
 * opposite things, and that "a reminder row must always render its reason".
 * A glyph cannot say which direction in time it points. A word can.
 */

const svg = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24' });

/**
 * AN ENVELOPE, PLAIN.
 *
 * The jade disc on an EMAIL reminder — the act of writing to them, `mailto:`.
 *
 * ⚠️ `InvitationsGlyph` (tile-glyphs.tsx) is a SEALED envelope and means
 * "invitations you have sent". This one is open at the fold because you are
 * about to write. Same object, opposite moment, and they must not be swapped.
 */
export function EmailGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Rect x={1.8} y={4.6} width={20.4} height={14.8} rx={3} fill={color} fillOpacity={0.95} />
      <Path
        d="M3.8 7 12 13.2 20.2 7"
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
 * A BELL.
 *
 * `reminderKind: 'OTHER'` — a reminder with no verb of its own.
 *
 * ⚠️ An OTHER row has no `tel:` and no `mailto:`, so this mark never sits in a
 * jade action disc. It is the row's leading mark, in a tinted tile, and the
 * row carries ONE disc (Done) instead of two. See the folder's SPEC §5.
 */
export function ReminderGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path
        d="M12 1.8a1.7 1.7 0 0 1 1.7 1.7v.6a6.6 6.6 0 0 1 4.9 6.4v3.4l1.7 2.8a1 1 0 0 1-.9 1.5H4.6a1 1 0 0 1-.9-1.5l1.7-2.8V10.5a6.6 6.6 0 0 1 4.9-6.4v-.6A1.7 1.7 0 0 1 12 1.8Z"
        fill={color}
        fillOpacity={0.95}
      />
      <Path d="M9.2 19.8a2.9 2.9 0 0 0 5.6 0Z" fill={color} fillOpacity={0.55} />
    </Svg>
  );
}

/**
 * AN HOUR THAT HAS GONE ROUND TOO FAR.
 *
 * "Going cold" — a client with no reminder and no contact in a long time. The
 * ring is DASHED at .34 because nothing is scheduled; the hand is past the
 * bottom because the time has run on without anybody deciding anything.
 *
 * ⚠️ The threshold is not in this mark and must not be invented in the widget
 * either — see the folder's OPEN.md. Whatever it is, the card prints it:
 * "no contact in 30 days", never a silent judgement.
 */
export function ColdGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={12} cy={12} r={9.4} fill={color} fillOpacity={0.22} />
      <Path
        d="M12 2.6a9.4 9.4 0 0 1 0 18.8"
        fill="none"
        stroke={color}
        strokeOpacity={0.34}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeDasharray="3 4"
      />
      <Circle cx={12} cy={12} r={5.4} fill={color} fillOpacity={0.95} />
      <Path d="M12 9.2V12l-2.2 1.6" fill="none" stroke={contrast} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * A BUILDING.
 *
 * The 16pt badge on a client monogram when `type === 'COMPANY'`.
 *
 * ⚠️ Drawn at 10–11px and nowhere else. At that size the windows are the only
 * thing that reads, which is why there are six of them and no door detail.
 */
export function ClientCompanyGlyph({ size = 24, color, contrast = '#0b0f12' }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Path d="M2.6 21.4V5.4a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16Z" fill={color} fillOpacity={0.95} />
      <Rect x={15.4} y={9.6} width={6} height={11.8} rx={1.6} fill={color} fillOpacity={0.45} />
      <Rect x={5.2} y={6.8} width={2.6} height={2.6} rx={0.9} fill={contrast} />
      <Rect x={9.2} y={6.8} width={2.6} height={2.6} rx={0.9} fill={contrast} />
      <Rect x={5.2} y={11.4} width={2.6} height={2.6} rx={0.9} fill={contrast} />
      <Rect x={9.2} y={11.4} width={2.6} height={2.6} rx={0.9} fill={contrast} />
      <Rect x={6.6} y={16.2} width={3.4} height={5.2} rx={1.1} fill={contrast} />
    </Svg>
  );
}

/**
 * A FIGURE.
 *
 * The same badge when `type === 'PERSON'` — or absent, which the type says
 * *"reads as PERSON — the column's own default."*
 *
 * ⚠️ This distinction is not decoration. `isContact` marks *"a person who works
 * at a company — NOT a client, and never billed as one"*, and
 * `isPortalResident` marks *"somebody's tenant with an app login"*. Neither
 * belongs on this card at all — the badge only ever tells a real person-client
 * from a company-client.
 */
export function ClientPersonGlyph({ size = 24, color }: GlyphProps) {
  return (
    <Svg {...svg(size)}>
      <Circle cx={12} cy={7.6} r={4.8} fill={color} fillOpacity={0.95} />
      <Path
        d="M12 14.2c-4.2 0-7.6 3.2-7.6 7.2h15.2c0-4-3.4-7.2-7.6-7.2Z"
        fill={color}
        fillOpacity={0.95}
      />
    </Svg>
  );
}
