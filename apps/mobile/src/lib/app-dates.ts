import i18n from '../i18n';

/**
 * Day and month NAMES in the app's language — never the phone's.
 *
 * ⚠️ `toLocaleDateString(undefined, …)` asks the DEVICE: a member reading the
 * app in German on an English phone got "Monday" inside a German sentence.
 * The app's language is what `i18n` holds, and it is the one every sentence
 * around these names is written in.
 */
export function weekdayName(d: Date, style: 'long' | 'short' | 'narrow' = 'long'): string {
  return d.toLocaleDateString(i18n.language || 'en', { weekday: style });
}

export function monthName(d: Date): string {
  return d.toLocaleDateString(i18n.language || 'en', { month: 'long' });
}
