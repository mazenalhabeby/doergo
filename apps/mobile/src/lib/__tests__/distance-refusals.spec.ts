/**
 * A distance refusal, as the member reads it.
 *
 * The server refuses "Arrived" far from the job with a CODE and two figures
 * (`distanceMetres`, `radiusMetres`) — not a sentence with "9630871m" in it.
 * The phone writes the sentence from `offline.errors.<CODE>` in the member's
 * language, the distance through the shared formatter.
 */
import fs from 'fs';
import path from 'path';
import { refusalText, refusalInterpolation } from '../distance';

const LOCALES = ['en', 'de', 'es', 'fr', 'it'] as const;
const dir = path.join(__dirname, '../../i18n/locales');
const load = (l: string) => JSON.parse(fs.readFileSync(path.join(dir, `${l}.json`), 'utf8')) as Record<string, any>;
const all = Object.fromEntries(LOCALES.map((l) => [l, load(l)]));

const CODES = ['TOO_FAR_TO_ARRIVE', 'TOO_FAR_TO_START', 'OUTSIDE_GEOFENCE', 'AWAY_NOT_ALLOWED'] as const;

/** A tiny i18next stand-in over the real English catalogue. */
const t = (key: string, opts: Record<string, unknown> = {}) => {
  const v = key.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), all.en);
  if (typeof v !== 'string') return (opts.defaultValue as string) ?? key;
  return v.replace(/\{\{(\w+)\}\}/g, (_, n: string) => String(opts[n] ?? `{{${n}}}`));
};

describe('distance refusals', () => {
  it('the arrival refusal reads like a person wrote it', () => {
    const text = refusalText(t, {
      code: 'TOO_FAR_TO_ARRIVE',
      message: 'You are 9,631 km from the job site…',
      params: { distanceMetres: 9630871, radiusMetres: 100 },
    }, 'fallback');
    expect(text.replace(/ /g, ' ')).toBe(
      'You are 9,631 km from the job site. You need to be within 100 m to mark it as arrived. Please move closer and try again.',
    );
  });

  it('keeps plain params (the workspace name) and formats the distances', () => {
    expect(refusalInterpolation({ distanceMetres: 1234, radiusMetres: 50, location: 'Lager', current: { id: 'x' } })).toEqual({
      distanceMetres: 1234,
      radiusMetres: 50,
      location: 'Lager',
      distance: '1.2 km',
      radius: '50 m',
    });
  });

  it('an unknown code falls back to the server text, then to the screen fallback', () => {
    expect(refusalText(t, { code: 'SOMETHING_NEW', message: 'Server says no' }, 'fallback')).toBe('Server says no');
    expect(refusalText(t, {}, 'fallback')).toBe('fallback');
  });

  it.each(LOCALES)('%s says every distance refusal, with the distance and no unit of its own', (l) => {
    for (const code of CODES) {
      const s = all[l].offline.errors[code];
      expect([code, typeof s]).toEqual([code, 'string']);
      expect(s).toContain('{{distance}}');
      expect(s).not.toMatch(/\{\{(distance|radius)\}\}\s?k?m(?![\p{L}])/u);
    }
  });

  it('German is formal', () => {
    for (const code of CODES) expect(all.de.offline.errors[code]).toMatch(/\bSie\b/);
  });
});
