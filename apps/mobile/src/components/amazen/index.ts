/**
 * Amazen Trust — the v2 primitives.
 *
 * Everything a screen needs to be in the language and nothing that decides
 * what a screen SAYS. Tokens live in `src/theme/amazen.ts`; the marks live in
 * `src/components/home/` and are one family with one construction law.
 */
export { Ground } from './ground';
export { GlassCard, Well, Sunken, WellDivider, shadowGlass, shadowDisc, shadowDiscPrimary } from './surfaces';
export { AText, Eyebrow, type Tone, type TypeVariant, type ATextProps } from './text';
export { Hero, type HeroPart } from './hero';
export { Disc, DiscRow } from './disc';
export { PrimaryButton, GhostButton, Chip } from './button';
export { LiveDot } from './live-dot';
export { WidgetFrame, WidgetHeader, WidgetBoundary } from './widget-frame';
export { TabPill, useTabSafe, tabSafeFor, type TabPillItem } from './tab-pill';
export { ScreenHeader } from './screen-header';
