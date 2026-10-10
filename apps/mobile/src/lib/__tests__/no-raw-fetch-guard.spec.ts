/**
 * Every request the phone makes goes through ONE client — the shared core
 * plugged in by src/lib/api/client.ts.
 *
 * The review found requests that went around it: the address picker's
 * geocoding (sent with no token at all), the avatar upload, the version gate
 * and the Face ID key calls — each with its own timeout rules, its own error
 * shapes and its own idea of the API's address. A `fetch(` written anywhere
 * else is a request that skips the token, the refresh, the timeout, the
 * offline cache and the connectivity monitor, and nothing else would notice.
 *
 * Allowed, by name and with the reason:
 *   - the PUT of a file to a presigned storage URL the API minted — the one
 *     request whose address is not the API (and which must carry no token).
 *
 * And the API's address is written in one place: base-url.ts.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const DIRS = ['src', 'app'].map((d) => path.join(ROOT, d));

/** Files allowed to talk to the network themselves, and why. */
const RAW_NETWORK_ALLOWED: Record<string, string> = {
  'src/lib/api/attachments.ts': 'uploadToPresignedUrl — XHR PUT to the storage URL the API minted (progress events; no token)',
};

const API_PREFIX_ALLOWED = new Set(['src/lib/api/base-url.ts']);

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');

function* walk(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      yield* walk(full);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.(spec|test)\./.test(entry.name)) {
      yield full;
    }
  }
}

const files = DIRS.flatMap((d) => [...walk(d)]).map((f) => ({ rel: path.relative(ROOT, f), src: strip(fs.readFileSync(f, 'utf8')) }));

/** A bare `fetch(` — not `NetInfo.fetch()`, not `refetch(`. */
const RAW_FETCH = /(?<![.\w$])fetch\s*\(/;
const RAW_XHR = /\bXMLHttpRequest\b/;
const API_PREFIX = /\/api\/v\d/;

describe('every request goes through the API client', () => {
  it('reads the app (a rename that matched nothing would pass everything)', () => {
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((f) => f.rel === 'src/lib/api/client.ts')).toBe(true);
  });

  it('no fetch( or XMLHttpRequest outside the client and the presigned upload', () => {
    const offenders = files
      .filter((f) => (RAW_FETCH.test(f.src) || RAW_XHR.test(f.src)) && !RAW_NETWORK_ALLOWED[f.rel])
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('the allowances are still needed (an exemption nobody uses is one to delete)', () => {
    for (const rel of Object.keys(RAW_NETWORK_ALLOWED)) {
      const f = files.find((x) => x.rel === rel);
      expect([rel, !!f && (RAW_FETCH.test(f.src) || RAW_XHR.test(f.src))]).toEqual([rel, true]);
    }
  });

  it('the API prefix is written only in base-url.ts', () => {
    const offenders = files.filter((f) => API_PREFIX.test(f.src) && !API_PREFIX_ALLOWED.has(f.rel)).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('the guard itself catches what it claims to', () => {
    expect(RAW_FETCH.test('const r = await fetch(`${API_URL}/geo/search`)')).toBe(true);
    expect(RAW_FETCH.test('await NetInfo.fetch()')).toBe(false);
    expect(RAW_FETCH.test('refetch()')).toBe(false);
    expect(RAW_XHR.test('new XMLHttpRequest()')).toBe(true);
    expect(API_PREFIX.test("'http://localhost:4000/api/v1'")).toBe(true);
  });
});
