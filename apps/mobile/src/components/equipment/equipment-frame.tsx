import React from 'react';
import { router } from 'expo-router';
import { useTheme } from '../../contexts/theme-context';
import { Ground, HeaderBack, ScreenHeader } from '../amazen';

/**
 * The page an equipment screen sits on: the app's ground and header, with Back.
 * The receipt and logbook forms keep their own bodies; this is what makes them
 * look like the rest of the app around them.
 */
export function EquipmentFrame({ title, onBack, children }: { title: string; onBack?: () => void; children?: React.ReactNode }) {
  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader title={title} leading={<HeaderBack onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.navigate('/(app)/my-assets' as never)))} />} />
      {children}
    </Ground>
  );
}

/**
 * The old form palette's roles, answered by the app's design — so a long form
 * written against `colors.textMuted` and `COLORS.primary` draws in the new
 * look without every line of it being rewritten.
 */
export function useFormPalette() {
  const { amazen } = useTheme();
  const a = amazen.color;
  return {
    colors: {
      background: 'transparent', surface: a.well, surfaceRaised: a.tile, card: a.well, border: a.lineWell,
      textPrimary: a.inkStrong, textSecondary: a.ink, textMuted: a.inkMuted, input: a.sunken, inputBorder: a.lineWell,
    },
    COLORS: { primary: a.accentSolid, onPrimary: a.accentInk, error: a.critical, white: a.accentInk },
  };
}
