import type { AmazenColors } from './amazen';

/**
 * A tone's colour — the one mapping screens used to write as nested ternaries
 * (`tone === 'critical' ? c.critical : tone === 'warn' ? c.warn : …`).
 *
 * `crit` is the home strip's spelling of critical. Any other tone ('muted',
 * 'calm', 'strong', 'neutral', none) gets the caller's fallback, exactly as the
 * last branch of each ternary did — so the result at every call site is the
 * value it had before.
 */
export function toneColor(c: AmazenColors, tone: string | null | undefined, fallback: string): string {
  if (tone === 'critical' || tone === 'crit') return c.critical;
  if (tone === 'warn') return c.warn;
  if (tone === 'accent') return c.accent;
  return fallback;
}

/** The same tone as a background tint. */
export function toneTint(c: AmazenColors, tone: string | null | undefined, fallback: string): string {
  if (tone === 'critical' || tone === 'crit') return c.criticalTint;
  if (tone === 'warn') return c.warnTint;
  if (tone === 'accent') return c.accentTint;
  return fallback;
}
