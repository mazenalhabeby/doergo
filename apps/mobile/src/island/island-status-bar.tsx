import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { useIsland } from './island-context';

/**
 * THE APP'S ONE STATUS BAR.
 *
 * ⚠️ NEVER A SECOND `<StatusBar>`. The comment beside it in `app/_layout.tsx`
 * records the bug that came from having two: both write the same global on
 * every render, and which one lands is commit order.
 *
 * ⚠️ HIDDEN WHILE THE ISLAND IS OPEN OVER IT. The OS draws the status bar
 * above the app, so the clock and the battery would print on top of the
 * island's icon and time.
 */
export function IslandStatusBar({ isDark }: { isDark: boolean }) {
  const { statusBarHidden } = useIsland();
  return <StatusBar style={isDark ? 'light' : 'dark'} hidden={statusBarHidden} animated hideTransitionAnimation="fade" />;
}
