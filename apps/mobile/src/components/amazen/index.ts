/**
 * Amazen Trust — the v2 primitives.
 *
 * Everything a screen needs to be in the language and nothing that decides
 * what a screen SAYS. Tokens live in `src/theme/amazen.ts`; the marks live in
 * `src/components/home/` and are one family with one construction law.
 */
export { Ground } from './ground';
export { GlassCard, Well, Sunken, WellDivider, shadowGlass, shadowDisc, shadowDiscPrimary, CardSurface, SurfaceProvider, useSurface, type SurfaceKind } from './surfaces';
export { AText, Eyebrow, type Tone, type TypeVariant, type ATextProps } from './text';
export { Hero, type HeroPart } from './hero';
export { Disc, DiscRow } from './disc';
export { PrimaryButton, GhostButton, Chip } from './button';
export { LiveDot } from './live-dot';
export { WidgetFrame, WidgetHeader, WidgetBoundary } from './widget-frame';
export { TabPill, useTabSafe, tabSafeFor, type TabPillItem } from './tab-pill';
export { ScreenHeader, type HeaderAction } from './screen-header';

/*
  ⚠️ THIS BARREL HOLDS PRIMITIVES ONLY, AND NOTHING THAT OWNS A GESTURE.

  `arrangeable.tsx` used to live beside these files — a hand-written drag
  layer — and the day it was added to this barrel the whole app rendered a
  black screen on every tab. Not a crash, not an error in logcat: nothing
  drawn. This barrel is imported by most of the app; that file imported
  gesture-handler and Reanimated and was itself imported BY the home screen,
  which also imports this barrel. A require cycle resolves to `undefined` at
  module init rather than throwing.

  It is the same failure `documents-reminder-card` hit by importing `./home`,
  whose index also exported four whole screens: the device log carried 72 of
  those warnings. A barrel is only safe when everything behind it is the same
  KIND of thing.

  The drag layer itself is gone — `react-native-draggable-flatlist` owns the
  home screen's reordering now — but the rule it taught stands: a component
  that owns a gesture is imported BY PATH, never from here.
*/
