import React from 'react';
import { Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { AText } from './text';
import { TourTarget } from '../../features/tour/tour-target';

/**
 * The top of a screen — a date, a name, and who you are.
 *
 * ⚠️ THIS REPLACES A NAVIGATION BAR, it is not one. The stock header is a
 * band: a logo on the left, a centred title, an avatar on the right, and a
 * hairline under all of it. It spends the most valuable 56pt on the screen
 * saying the name of the tab you just pressed — which is the one thing the
 * person already knows.
 *
 * What goes there instead is what they do not know: what day it is, and which
 * company's work they are looking at. A member who covers three sites reads
 * that line before anything else on the screen.
 *
 * Every measurement is taken off the design reference at 390pt.
 */
export interface HeaderAction {
  label: string;
  /**
   * What a screen reader says, when the label is a symbol.
   *
   * ⚠️ A SYMBOL IS ONLY ALLOWED WHEN THE MODE ALREADY SAYS WHAT IT IS. A bare
   * ＋ beside "Done" on a jiggling column cannot be misread; the same ＋ on a
   * resting screen could be anything. iOS uses exactly this: a symbol in the
   * corner, and only while editing.
   */
  a11yLabel?: string;
  active?: boolean;
  onPress: () => void;
  /** Registers this button for a guided tour step, under this key. */
  tourKey?: string;
}

/** A tour anchor when a key is given; otherwise nothing is added to the tree. */
export function Anchor({ name, children }: { name?: string; children: React.ReactNode }) {
  return name ? <TourTarget name={name}>{children}</TourTarget> : <>{children}</>;
}

/**
 * The date and the name, as one target sized to the TEXT — `alignSelf` keeps
 * the ring on the words, not on the empty width up to the buttons.
 */
export function TitleAnchor({ name, children }: { name?: string; children: React.ReactNode }) {
  return name ? (
    <TourTarget name={name} style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>{children}</TourTarget>
  ) : (
    <>{children}</>
  );
}

/**
 * Back, for a header's `leading` slot — a round tile, the same size as the
 * avatar opposite it, so the text between them is centred by construction.
 *
 * ⚠️ ONE OF THESE. New job drew its own and a second screen was about to copy
 * it; two drawings of Back is how one screen's arrow ends up a pixel lower.
 */
export function HeaderBack({ onPress }: { onPress: () => void }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 43,
        height: 43,
        borderRadius: 22,
        backgroundColor: amazen.color.tile,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <AText variant="body" tone="strong" style={{ fontSize: 22, lineHeight: 26 }}>‹</AText>
    </Pressable>
  );
}
