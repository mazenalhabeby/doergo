/**
 * The background-location disclosure: shown before the OS prompt, once when accepted — and, since the clock
 * review, NOT again for a day after "Not now" (the Time screen asks on every visit; the sheet came back each time).
 */
const store = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => store.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    removeItem: jest.fn(async (k: string) => void store.delete(k)),
  },
}));

import {
  CONSENT_ASK_AGAIN_MS,
  registerConsentUI,
  requestBackgroundLocationConsent,
  resolveBackgroundLocationConsent,
} from '../location-consent';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('background-location disclosure', () => {
  let shown = 0;
  let unregister: () => void;
  beforeEach(() => {
    store.clear();
    shown = 0;
    unregister = registerConsentUI((show) => void (show && shown++));
  });
  afterEach(() => unregister());

  it('"Not now" is remembered: the next ask the same day answers no without the sheet', async () => {
    const first = requestBackgroundLocationConsent();
    await flush();
    expect(shown).toBe(1);
    await resolveBackgroundLocationConsent(false);
    expect(await first).toBe(false);
    expect(await requestBackgroundLocationConsent()).toBe(false);
    expect(shown).toBe(1);
  });

  it('a day later it may be shown again', async () => {
    store.set('@hbcfield/bg-location-declined-at', String(Date.now() - CONSENT_ASK_AGAIN_MS - 1000));
    const ask = requestBackgroundLocationConsent();
    await flush();
    expect(shown).toBe(1);
    await resolveBackgroundLocationConsent(true);
    expect(await ask).toBe(true);
  });

  it('accepting forgets an earlier "Not now" and is never asked again', async () => {
    store.set('@hbcfield/bg-location-declined-at', '1');
    const ask = requestBackgroundLocationConsent();
    await flush();
    await resolveBackgroundLocationConsent(true);
    expect(await ask).toBe(true);
    expect(store.has('@hbcfield/bg-location-declined-at')).toBe(false);
    expect(await requestBackgroundLocationConsent()).toBe(true);
    expect(shown).toBe(1);
  });

  it('concurrent asks share one sheet', async () => {
    const a = requestBackgroundLocationConsent();
    const b = requestBackgroundLocationConsent();
    await flush();
    expect(shown).toBe(1);
    await resolveBackgroundLocationConsent(true);
    expect(await Promise.all([a, b])).toEqual([true, true]);
  });
});
