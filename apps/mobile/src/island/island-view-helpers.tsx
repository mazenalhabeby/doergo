import { StyleSheet, type TextLayoutEventData, type NativeSyntheticEvent } from 'react-native';
import type { IconName } from '@hbcfield/shared/client';
import { Icon } from '@/components/amazen/ink-icon';
import { ISLAND, type Tone } from './tokens';
import { FONT } from '../theme/amazen';
import { DROP_SIDE, ICON, ICON_GAP, SIDE } from './geometry';

/** IslandView's module-level helpers, moved here unchanged so its sections can read them too. */
/** ⚠️ FILLED ICONS ONLY — an outline reads as a hairline on black. */
export const ICONS: Record<Tone, IconName> = {
  done: 'selected',
  waiting: 'alert',
  failed: 'closeCircle',
  queued: 'offline',
};

export function lineWidth(e: NativeSyntheticEvent<TextLayoutEventData>): number {
  return e.nativeEvent.lines.reduce((m, l) => Math.max(m, l.width), 0);
}

export function Glyph({ tone, fg }: { tone: Tone; fg: string }) {
  return <Icon name={ICONS[tone]} size={ICON} color={fg} />;
}

export const styles = StyleSheet.create({
  /* Off-screen, and not a layout area for anything else. */
  measure: { position: 'absolute', top: -9999, left: -9999, opacity: 0 },
  /*
    ⚠️ A FULL-SCREEN OVERLAY, NOT A ZERO-HEIGHT STRIP. An absolutely
    positioned parent with no height clips its children on Android, where
    `overflow: hidden` is the default — the island would simply not be there,
    on the platform we cannot see while building it.
  */
  stage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 },
  island: {
    position: 'absolute',
    left: 0,
    /* ⚠️ Black in both themes — see `tokens.ts`. */
    backgroundColor: ISLAND.bg,
    overflow: 'hidden',
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ICON_GAP,
    paddingHorizontal: SIDE,
  },
  /* Under the lens: a little more air than the head row, text left-aligned. */
  drop: { paddingHorizontal: DROP_SIDE, paddingTop: 4, paddingBottom: 16, gap: 3 },
  title: { fontFamily: FONT.sansMedium, fontSize: 16, lineHeight: 21, color: ISLAND.ink, letterSpacing: -0.2 },
  body: { fontFamily: FONT.sans, fontSize: 14, lineHeight: 19, color: ISLAND.dim },
  /* ⚠️ With no title the sentence IS the message — full ink, same size, so the measured height holds. */
  bodyAlone: { color: ISLAND.ink },
  /* The time: mono, quiet — it is context, not the news. */
  value: {
    fontFamily: FONT.monoMedium,
    fontSize: 13,
    lineHeight: 18,
    color: ISLAND.dim,
    fontVariant: ['tabular-nums'],
  },
  action: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: ISLAND.line,
  },
  actionLabel: { fontFamily: FONT.sansMedium, fontSize: 13 },
});
