import type { LogColor } from '@hbcfield/shared/client';

/**
 * How a log type reads on the phone: its colour and its name.
 *
 * The kind stores a colour NAME (see `LOG_COLORS` in shared) rather than a hex,
 * so the phone and the browser each map it onto their own palette and a
 * hand-edited value cannot reach every viewer. Anything unknown reads as slate.
 */
const HEX: Record<LogColor, string> = {
  slate: '#64748b',
  blue: '#2563eb',
  green: '#16a34a',
  amber: '#d97706',
  red: '#dc2626',
  violet: '#7c3aed',
  teal: '#0d9488',
  orange: '#ea580c',
};

export function logColor(name: string | null | undefined): string {
  return HEX[(name ?? 'slate') as LogColor] ?? HEX.slate;
}

/**
 * A log type's name to show. The built-in Cost log is named by its KEY and
 * translated here — its stored label is an English placeholder — while every
 * other type is the kind's own word, typed by whoever set the kind up.
 */
export function logTypeLabel(type: { key: string; label: string }, t: (k: string, d: string) => string): string {
  return type.key === 'cost' ? t('logbook.cost', 'Cost') : type.label;
}
