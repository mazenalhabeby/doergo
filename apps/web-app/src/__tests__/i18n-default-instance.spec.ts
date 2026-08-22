/**
 * The global i18next instance must stay English on the server, no matter what
 * the localized marketing routes do.
 *
 * The bug this exists for: `/[lang]` built a request-scoped instance and called
 * `.use(initReactI18next)` on it. That plugin publishes its instance as
 * react-i18next's global default — the instance every `useTranslation()` WITHOUT
 * a provider resolves to. So a single request to /it repointed the default at
 * Italian, and `/` (no provider) served Italian to every visitor and every
 * crawler until the process restarted.
 *
 * Nothing caught it: types were fine, tests were fine, the local build was fine
 * (prerender order happened to end on English), and the hydrated page in a
 * browser looked correct because the client re-renders in the user's language.
 * It was only ever visible in the raw HTML the server returned.
 */
import { getI18n } from 'react-i18next';
import i18n, { changeLanguage } from '@/i18n';

describe('i18n global default instance', () => {
  it('is the app instance, pinned to English on the server', () => {
    expect(i18n.language).toBe('en');
    expect(getI18n()).toBe(i18n);
  });

  it('survives a localized instance being created', async () => {
    // Exactly what LocalizedHome does for /de, /es, /fr, /it.
    const { createInstance } = await import('i18next');
    const localized: any = createInstance();
    await localized.init({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resources: { it: { translation: { home: { pricing: { label: 'Prezzi' } } } } },
      lng: 'it',
      fallbackLng: 'en',
    });

    expect(localized.language).toBe('it');
    // The localized instance must NOT have become the default…
    expect(getI18n()).toBe(i18n);
    // …and the shared instance must not have been dragged along with it.
    expect(i18n.language).toBe('en');
  });

  it('refuses a language it has no bundle for', () => {
    // An unsupported code would leave i18next without a resource bundle and the
    // UI resolves to whatever it finds — the same class of failure, reached from
    // the other side. (Server rendering is pinned by `lng` at init; jsdom always
    // has a `window`, so that half is not observable from here.)
    changeLanguage('zz');
    expect(i18n.language).toBe('en');
    changeLanguage('de');
    expect(i18n.language).toBe('de');
    changeLanguage('en');
  });
});
