/**
 * Only English is evaluated at launch; every other language is loaded on its
 * first use — and ALWAYS before the switch, so nobody sees English for a
 * language they chose (src/i18n/index.ts).
 */
import * as fs from 'fs';
import * as path from 'path';

const stored = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => stored.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => { stored.set(k, v); }),
  },
}));

const de = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../i18n/locales/de.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../i18n/locales/en.json'), 'utf8'));

function load() {
  let mod!: typeof import('../../i18n');
  jest.isolateModules(() => { mod = require('../../i18n'); });
  return mod;
}

beforeEach(() => stored.clear());

describe('the catalogues', () => {
  it('English is there at launch; German is NOT evaluated until somebody needs it', async () => {
    const { default: i18n, i18nReady } = load();
    await i18nReady;
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(true);
    expect(i18n.hasResourceBundle('de', 'translation')).toBe(false);
    expect(i18n.t('common.cancel')).toBe(en.common.cancel);
  });

  it('switching loads the bundle FIRST — the very next string is German', async () => {
    const { default: i18n, changeLanguage } = load();
    await changeLanguage('de');
    expect(i18n.language).toBe('de');
    expect(i18n.t('common.cancel')).toBe(de.common.cancel);
    expect(stored.get('hbcfield_language')).toBe('de');
  });

  it('even a direct i18n.changeLanguage cannot switch to an unloaded language', async () => {
    const { default: i18n } = load();
    await i18n.changeLanguage('de');
    expect(i18n.t('common.cancel')).toBe(de.common.cancel);
    await i18n.changeLanguage('en');
    expect(i18n.t('common.cancel')).toBe(en.common.cancel);
  });

  it('a stored choice is APPLIED before i18nReady resolves — the first screen is already German', async () => {
    stored.set('hbcfield_language', 'de');
    const { default: i18n, i18nReady } = load();
    await i18nReady;
    expect(i18n.language).toBe('de');
    expect(i18n.t('common.cancel')).toBe(de.common.cancel);
  });

  it('every supported language loads', async () => {
    const { ensureLanguage, default: i18n } = load();
    for (const l of ['de', 'es', 'fr', 'it']) {
      expect(ensureLanguage(l)).toBe(true);
      expect(i18n.hasResourceBundle(l, 'translation')).toBe(true);
    }
    expect(ensureLanguage('xx')).toBe(false);
  });
});

describe('the source', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../i18n/index.ts'), 'utf8');
  it('imports only English at the top, and requires the others by literal path (never a template literal)', () => {
    expect(src.match(/^import .* from '\.\/locales\/\w+\.json';$/gm)).toEqual(["import en from './locales/en.json';"]);
    for (const l of ['de', 'es', 'fr', 'it']) expect(src).toContain(`require('./locales/${l}.json')`);
    expect(src).not.toMatch(/require\(`/);
  });
});
