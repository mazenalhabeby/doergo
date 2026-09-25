import React from 'react';
import { StatusBar } from 'expo-status-bar';

/**
 * THE APP'S ONE STATUS BAR.
 *
 * ⚠️ NEVER A SECOND `<StatusBar>`. The comment beside it in `app/_layout.tsx`
 * records the bug that came from having two: both write the same global on
 * every render, and which one lands is commit order.
 *
 * The island needs nothing from it: where it grows over the status bar it
 * covers it, and everywhere else the icons sit on the app's own ground.
 */
export function IslandStatusBar({ isDark }: { isDark: boolean }) {
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}
