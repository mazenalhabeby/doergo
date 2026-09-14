/**
 * How old what the member sees is.
 */
import { LONG_OFFLINE_MS, STALE_AFTER_MS, freshnessOf, newest } from '../freshness';
import en from '../../i18n/locales/en.json'
import de from '../../i18n/locales/de.json'
import es from '../../i18n/locales/es.json'
import fr from '../../i18n/locales/fr.json'
import itLocale from '../../i18n/locales/it.json'

const NOW = Date.parse('2026-09-15T21:40:00.000Z');
const H = 3_600_000;

describe('freshness', () => {
  it('is a quiet clock time while recent', () => {
    expect(freshnessOf(NOW - 2 * H, NOW)).toEqual({ kind: 'at', at: NOW - 2 * H, stale: false });
    expect(freshnessOf(NOW - STALE_AFTER_MS + 1, NOW).kind).toBe('at');
  });

  it('becomes an age past 12 hours — hours, then days', () => {
    expect(freshnessOf(NOW - 14 * H, NOW)).toMatchObject({ kind: 'age', unit: 'hours', value: 14, stale: true, longOffline: false });
    expect(freshnessOf(NOW - 50 * H, NOW)).toMatchObject({ kind: 'age', unit: 'days', value: 2, longOffline: false });
  });

  it('counts as long offline from three days', () => {
    expect(freshnessOf(NOW - LONG_OFFLINE_MS, NOW)).toMatchObject({ unit: 'days', value: 3, longOffline: true });
  });

  it('says nothing for a copy that was never updated', () => {
    expect(freshnessOf(null, NOW)).toEqual({ kind: 'never' });
    expect(freshnessOf(0, NOW)).toEqual({ kind: 'never' });
  });

  it('takes the newest of the moments it knows', () => {
    expect(newest(null, NOW - H, undefined, NOW - 2 * H)).toBe(NOW - H);
    expect(newest(null, undefined)).toBeNull();
  });

  it('has its words in all five languages', () => {
    for (const locale of [en, de, es, fr, itLocale] as any[]) {
      for (const k of ['at', 'hours_one', 'hours_other', 'days_one', 'days_other']) expect(typeof locale.offline.freshness[k]).toBe('string');
      expect(typeof locale.offline.banner.longOffline_other).toBe('string');
      expect(locale.offline.freshness.at).toContain('{{time}}');
    }
  });
});
