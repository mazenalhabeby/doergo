import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { useIsland } from './island-context';

/**
 * THE APP'S ONE STATUS BAR, WHICH NOW HAS ONE MORE THING TO CONSIDER.
 *
 * ⚠️ A VISOR IS BLACK, AND IN LIGHT MODE THE STATUS BAR DRAWS DARK ICONS —
 * §5.5. The clock and the battery sit directly on it and vanish.
 *
 * ⚠️ AND THE FIX IS NOT A SECOND `<StatusBar>`. There is exactly one in this
 * tree and the comment beside it in `app/_layout.tsx` records the bug that
 * came from having two: both write the same global on every render, and which
 * one lands is commit order, so the icon colour was undefined whenever they
 * disagreed. This is that same one component, moved inside the provider so it
 * can read the flag.
 */
export function IslandStatusBar({ isDark }: { isDark: boolean }) {
  const { visorShowing } = useIsland();
  return <StatusBar style={isDark || visorShowing ? 'light' : 'dark'} />;
}
