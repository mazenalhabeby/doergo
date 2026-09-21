/**
 * The sentence a member reads with no signal is in THEIR language.
 *
 * It used to be hard-coded English thrown from the API client, so a German
 * phone showed "Request timed out. Please check your connection." above a
 * button reading "Erneut versuchen" — and it blamed the member's connection
 * rather than saying the plain thing, that they are offline.
 */
import i18n from 'i18next';
import en from '../../../i18n/locales/en.json';
import de from '../../../i18n/locales/de.json';
import es from '../../../i18n/locales/es.json';
import fr from '../../../i18n/locales/fr.json';
import italian from '../../../i18n/locales/it.json';
import { networkErrorText } from '../network-error';

const LOCALES: Record<string, object> = { en, de, es, fr, it: italian };

describe('the no-signal sentence', () => {
  it('falls back to English before i18n has started (the background sync task)', () => {
    expect(i18n.isInitialized).toBeFalsy();
    expect(networkErrorText('offline')).toMatch(/offline/i);
    expect(networkErrorText('slow')).not.toContain('offline.network');
  });

  it('is written in every language the app ships', async () => {
    await i18n.init({
      resources: Object.fromEntries(Object.entries(LOCALES).map(([l, t]) => [l, { translation: t }])),
      lng: 'en',
      fallbackLng: false,
      interpolation: { escapeValue: false },
    });
    for (const locale of Object.keys(LOCALES)) {
      await i18n.changeLanguage(locale);
      for (const kind of ['offline', 'slow'] as const) {
        const text = networkErrorText(kind);
        expect(text).not.toContain('offline.network');
        expect(text.length).toBeGreaterThan(10);
      }
    }
    // The languages must actually differ — a missing translation that silently
    // fell back to English would otherwise pass every check above.
    await i18n.changeLanguage('en');
    const english = networkErrorText('offline');
    for (const locale of ['de', 'es', 'fr', 'it']) {
      await i18n.changeLanguage(locale);
      expect(networkErrorText('offline')).not.toBe(english);
    }
  });
});
