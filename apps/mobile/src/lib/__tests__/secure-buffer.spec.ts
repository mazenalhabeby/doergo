/**
 * The secure buffer: what a member's phone holds outside the encrypted
 * database is sealed with a key only that member's phone has.
 *
 * Every rule here is one a headless background task depends on: a read never
 * throws, a missing key is never confused with "no key yet", and a value that
 * does not open is null — not garbage, not an exception.
 */
import { webcrypto } from 'crypto';
import {
  createSecureBuffer, ENVELOPE, fromBase64, fromBase64Js, KeyUnavailableError, toBase64, toBase64Js, utf8Decode, utf8DecodeJs,
  utf8Encode, utf8EncodeJs,
  type KeyVault, type PlainStorage,
} from '../secure-buffer';

function memoryStorage() {
  const data = new Map<string, string>();
  const storage: PlainStorage & { data: Map<string, string> } = {
    data,
    getItem: jest.fn(async (k: string) => data.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => { data.set(k, v); }),
    removeItem: jest.fn(async (k: string) => { data.delete(k); }),
    multiRemove: jest.fn(async (ks: string[]) => { ks.forEach((k) => data.delete(k)); }),
    getAllKeys: jest.fn(async () => [...data.keys()]),
  };
  return storage;
}

function memoryVault() {
  const data = new Map<string, string>();
  let failing = 0;
  const maybeFail = () => { if (failing > 0) { failing--; throw new Error('errSecInteractionNotAllowed'); } };
  const vault: KeyVault & { data: Map<string, string>; failNext(n: number): void } = {
    data,
    failNext: (n) => { failing = n; },
    get: jest.fn(async (n: string) => { maybeFail(); return data.get(n) ?? null; }),
    set: jest.fn(async (n: string, v: string) => { maybeFail(); data.set(n, v); }),
    remove: jest.fn(async (n: string) => { maybeFail(); data.delete(n); }),
  };
  return vault;
}

const random = (n: number) => webcrypto.getRandomValues(new Uint8Array(n));

function setup(now = () => 1_000_000) {
  const storage = memoryStorage();
  const vault = memoryVault();
  const sb = createSecureBuffer({ storage, vault: () => vault, randomBytes: random, now });
  return { storage, vault, sb };
}

const POINTS = JSON.stringify({ taskId: 't1', points: [{ lat: 47.9813, lng: 13.8269, timestamp: '2026-10-10T06:00:00.000Z' }] });

describe('sealing', () => {
  it('round-trips, and what is on disk is ciphertext — no coordinate in it', async () => {
    const { storage, sb } = setup();
    await sb.write('route:mike:index', POINTS, 'mike');
    const raw = storage.data.get('route:mike:index')!;
    expect(raw.startsWith(ENVELOPE)).toBe(true);
    expect(raw).not.toContain('47.98');
    expect(raw).not.toContain('taskId');
    expect(await sb.read('route:mike:index', 'mike')).toBe(POINTS);
  });

  it('a fresh nonce per write: the same value twice is two different ciphertexts', async () => {
    const { storage, sb } = setup();
    await sb.write('k', POINTS, 'mike');
    const a = storage.data.get('k');
    await sb.write('k', POINTS, 'mike');
    expect(storage.data.get('k')).not.toBe(a);
  });

  it('keeps every character: umlauts, emoji, a lone surrogate turned into U+FFFD', async () => {
    const { sb } = setup();
    const note = 'Kühlung defekt — Ersatzteil bestellt 🔧 ✓ 日本';
    await sb.write('n', note, 'mike');
    expect(await sb.read('n', 'mike')).toBe(note);
    expect(utf8Decode(utf8Encode('a\ud800b'))).toBe('a�b');
  });

  it('base64 agrees with Node for every length', () => {
    for (let n = 0; n < 70; n++) {
      const bytes = random(n);
      const ours = toBase64(bytes);
      expect(ours).toBe(Buffer.from(bytes).toString('base64'));
      expect(Buffer.from(fromBase64(ours)!).equals(Buffer.from(bytes))).toBe(true);
    }
    expect(fromBase64('abc')).toBeNull();
    expect(fromBase64('ab$=')).toBeNull();
  });

  it('the JavaScript fallbacks (no btoa/atob/TextEncoder/escape) agree with the fast paths byte for byte', () => {
    const text = JSON.stringify({ note: 'Kühlung — 🔧 ✓ 日本 ß', p: [{ lat: 47.9813, lng: 13.8269 }] });
    const bytes = utf8EncodeJs(text);
    expect(Buffer.from(bytes).equals(Buffer.from(utf8Encode(text)))).toBe(true);
    expect(Buffer.from(bytes).equals(Buffer.from(text, 'utf8'))).toBe(true);
    expect(utf8DecodeJs(bytes)).toBe(text);
    expect(utf8Decode(bytes)).toBe(text);
    for (let n = 0; n < 70; n++) {
      const r = random(n);
      expect(toBase64Js(r)).toBe(toBase64(r));
      expect(Buffer.from(fromBase64Js(toBase64Js(r))!).equals(Buffer.from(r))).toBe(true);
    }
    expect(fromBase64Js('abc')).toBeNull();
    expect(fromBase64Js('ab$=')).toBeNull();
    // Invalid UTF-8 never throws: it reads as U+FFFD.
    expect(utf8Decode(new Uint8Array([0x61, 0xff, 0x62]))).toBe('a\ufffdb');
  });
});

describe('what does not open is null — never a throw', () => {
  it('another member reading it', async () => {
    const { sb } = setup();
    await sb.write('k', POINTS, 'mike');
    expect(await sb.read('k', 'karim')).toBeNull();
    // …even once karim has a key of his own.
    await sb.write('other', 'x', 'karim');
    expect(await sb.read('k', 'karim')).toBeNull();
  });

  it('moved to another storage key (the key is authenticated too)', async () => {
    const { storage, sb } = setup();
    await sb.write('a', POINTS, 'mike');
    storage.data.set('b', storage.data.get('a')!);
    expect(await sb.read('b', 'mike')).toBeNull();
  });

  it('one bit changed, truncated, or garbage', async () => {
    const { storage, sb } = setup();
    await sb.write('k', POINTS, 'mike');
    const raw = storage.data.get('k')!;
    const bytes = fromBase64(raw.slice(ENVELOPE.length))!;
    bytes[20] ^= 1;
    storage.data.set('k', ENVELOPE + toBase64(bytes));
    expect(await sb.read('k', 'mike')).toBeNull();
    storage.data.set('k', raw.slice(0, 30));
    expect(await sb.read('k', 'mike')).toBeNull();
    storage.data.set('k', `${ENVELOPE}%%%not base64%%%`);
    expect(await sb.read('k', 'mike')).toBeNull();
  });

  it('plaintext is not "sealed" — readSecure refuses it', async () => {
    const { storage, sb } = setup();
    storage.data.set('k', POINTS);
    expect(await sb.read('k', 'mike')).toBeNull();
  });

  it('missing value, or a member with no key yet', async () => {
    const { sb, vault } = setup();
    expect(await sb.read('nothing', 'mike')).toBeNull();
    // Reading never MAKES a key.
    expect(vault.data.size).toBe(0);
  });

  it('the storage itself throwing', async () => {
    const { storage, sb } = setup();
    (storage.getItem as jest.Mock).mockRejectedValueOnce(new Error('disk'));
    await expect(sb.read('k', 'mike')).resolves.toBeNull();
  });
});

describe('the key', () => {
  it('is made once, kept in the vault, and reused from memory', async () => {
    const { sb, vault } = setup();
    await sb.write('a', '1', 'mike');
    await sb.write('b', '2', 'mike');
    await sb.read('a', 'mike');
    expect(vault.set).toHaveBeenCalledTimes(1);
    expect(vault.get).toHaveBeenCalledTimes(1);
    expect(vault.data.size).toBe(1);
  });

  it('two writes racing on a cold start make ONE key, and both values open', async () => {
    const { sb, vault } = setup();
    await Promise.all([sb.write('a', '1', 'mike'), sb.write('b', '2', 'mike'), sb.write('c', '3', 'mike')]);
    expect(vault.set).toHaveBeenCalledTimes(1);
    expect(await Promise.all(['a', 'b', 'c'].map((k) => sb.read(k, 'mike')))).toEqual(['1', '2', '3']);
  });

  it('a new process reads the SAME key back from the vault', async () => {
    const { storage, vault, sb } = setup();
    await sb.write('k', POINTS, 'mike');
    const again = createSecureBuffer({ storage, vault: () => vault, randomBytes: random });
    expect(await again.read('k', 'mike')).toBe(POINTS);
  });

  it('⚠️ a vault that THROWS is not a vault with no key: nothing is made, nothing crashes, it reads null', async () => {
    const { storage, vault, sb } = setup();
    await sb.write('k', POINTS, 'mike');
    const fresh = createSecureBuffer({ storage, vault: () => vault, randomBytes: random, now: () => 0 });
    vault.failNext(1);
    await expect(fresh.read('k', 'mike')).resolves.toBeNull();
    // A write in the same moment fails too — it must not mint a second key over the first.
    await expect(fresh.write('j', 'x', 'mike')).rejects.toBeInstanceOf(KeyUnavailableError);
    expect(vault.set).toHaveBeenCalledTimes(1);
    expect(storage.data.has('j')).toBe(false);
  });

  it('recovers once the vault answers again', async () => {
    const { storage, vault, sb } = setup();
    await sb.write('k', POINTS, 'mike');
    let t = 0;
    const fresh = createSecureBuffer({ storage, vault: () => vault, randomBytes: random, now: () => t });
    vault.failNext(1);
    expect(await fresh.read('k', 'mike')).toBeNull();
    t = 5_000;
    expect(await fresh.read('k', 'mike')).toBe(POINTS);
  });

  it('no vault at all (no native module): writes refuse, reads are null — never plaintext', async () => {
    const storage = memoryStorage();
    const sb = createSecureBuffer({ storage, vault: () => null, randomBytes: random });
    await expect(sb.write('k', POINTS, 'mike')).rejects.toBeInstanceOf(KeyUnavailableError);
    expect(storage.data.size).toBe(0);
    expect(await sb.read('k', 'mike')).toBeNull();
  });
});

describe('forgetSecure — the crypto-shred', () => {
  it('deletes the key: everything sealed with it is unreadable, even by a new process', async () => {
    const { storage, vault, sb } = setup();
    await sb.write('k', POINTS, 'mike');
    expect(await sb.forget('mike')).toBe(true);
    expect(vault.data.size).toBe(0);
    expect(await sb.read('k', 'mike')).toBeNull();
    const again = createSecureBuffer({ storage, vault: () => vault, randomBytes: random });
    expect(await again.read('k', 'mike')).toBeNull();
  });

  it('only that member', async () => {
    const { sb } = setup();
    await sb.write('m', '1', 'mike');
    await sb.write('s', '2', 'sarah');
    await sb.forget('mike');
    expect(await sb.read('s', 'sarah')).toBe('2');
  });

  it('a write after it starts a NEW key; the old ciphertext stays noise', async () => {
    const { sb, vault } = setup();
    await sb.write('old', POINTS, 'mike');
    await sb.forget('mike');
    await sb.write('new', 'fresh', 'mike');
    expect(vault.set).toHaveBeenCalledTimes(2);
    expect(await sb.read('old', 'mike')).toBeNull();
    expect(await sb.read('new', 'mike')).toBe('fresh');
  });

  it('a vault that throws on delete reports false and does not crash', async () => {
    const { sb, vault } = setup();
    await sb.write('k', '1', 'mike');
    vault.failNext(1);
    await expect(sb.forget('mike')).resolves.toBe(false);
  });
});

describe('the sealed store and the one-time migration of plaintext', () => {
  const routeKeys = (owner: string) => (all: readonly string[]) => all.filter((k) => k.startsWith(`route:${owner}:`));

  it('re-seals every plaintext value of the member IN PLACE, once — nothing lost, nothing doubled, others untouched', async () => {
    const { storage, sb } = setup();
    storage.data.set('route:mike:index', '[{"id":"a","n":1}]');
    storage.data.set('route:mike:a', POINTS);
    storage.data.set('route:karim:index', '[{"id":"b","n":1}]');
    storage.data.set('theme', 'dark');

    const kv = sb.storageFor('mike', 'route', routeKeys('mike'));
    expect(await kv.getItem('route:mike:a')).toBe(POINTS);

    expect(storage.data.get('route:mike:index')!.startsWith(ENVELOPE)).toBe(true);
    expect(storage.data.get('route:mike:a')!.startsWith(ENVELOPE)).toBe(true);
    expect(storage.data.get('route:mike:a')).not.toContain('47.98');
    // Somebody else's list and unrelated settings are not this member's to seal.
    expect(storage.data.get('route:karim:index')).toBe('[{"id":"b","n":1}]');
    expect(storage.data.get('theme')).toBe('dark');
    // Same keys, no copies.
    expect([...storage.data.keys()].sort()).toEqual(['route:karim:index', 'route:mike:a', 'route:mike:index', 'theme']);

    const writes = (storage.setItem as jest.Mock).mock.calls.length;
    await kv.getItem('route:mike:index');
    await sb.storageFor('mike', 'route', routeKeys('mike')).getItem('route:mike:a');
    expect((storage.setItem as jest.Mock).mock.calls.length).toBe(writes);
    expect(await sb.read('route:mike:index', 'mike')).toBe('[{"id":"a","n":1}]');
  });

  it('a new process finds nothing left to migrate', async () => {
    const { storage, vault, sb } = setup();
    storage.data.set('route:mike:a', POINTS);
    await sb.storageFor('mike', 'route', routeKeys('mike')).getItem('route:mike:a');
    const writes = (storage.setItem as jest.Mock).mock.calls.length;
    const next = createSecureBuffer({ storage, vault: () => vault, randomBytes: random });
    expect(await next.storageFor('mike', 'route', routeKeys('mike')).getItem('route:mike:a')).toBe(POINTS);
    expect((storage.setItem as jest.Mock).mock.calls.length).toBe(writes);
  });

  it('a write never races the sweep: the newer value wins, not the older plaintext', async () => {
    const { storage, sb } = setup();
    storage.data.set('route:mike:index', 'OLD');
    const kv = sb.storageFor('mike', 'route', routeKeys('mike'));
    await kv.setItem('route:mike:index', 'NEW');
    expect(await kv.getItem('route:mike:index')).toBe('NEW');
  });

  it('⚠️ with the key unavailable the plaintext stays put and still reads; a write refuses instead of overwriting it', async () => {
    const storage = memoryStorage();
    storage.data.set('route:mike:a', POINTS);
    const sb = createSecureBuffer({ storage, vault: () => null, randomBytes: random });
    const kv = sb.storageFor('mike', 'route', routeKeys('mike'));
    expect(await kv.getItem('route:mike:a')).toBe(POINTS);
    await expect(kv.setItem('route:mike:a', '[]')).rejects.toBeInstanceOf(KeyUnavailableError);
    expect(storage.data.get('route:mike:a')).toBe(POINTS);
  });

  it('⚠️ a sealed value whose key cannot be read right now REJECTS — "cannot read" is not "empty"', async () => {
    const { storage, vault, sb } = setup();
    await sb.write('route:mike:a', POINTS, 'mike');
    const fresh = createSecureBuffer({ storage, vault: () => vault, randomBytes: random, now: () => 0 });
    vault.failNext(1);
    await expect(fresh.storageFor('mike', 'route', routeKeys('mike')).getItem('route:mike:a')).rejects.toBeInstanceOf(KeyUnavailableError);
  });

  it('a tampered sealed value reads as null through the store too', async () => {
    const { storage, sb } = setup();
    await sb.write('route:mike:a', POINTS, 'mike');
    const raw = storage.data.get('route:mike:a')!;
    storage.data.set('route:mike:a', raw.slice(0, -4) + (raw.endsWith('AAAA') ? 'BBBB' : 'AAAA'));
    expect(await sb.storageFor('mike', 'route', routeKeys('mike')).getItem('route:mike:a')).toBeNull();
  });
});

describe('speed — the route buffer writes a chunk every burst', () => {
  it('seals and opens a full 200-point chunk in a few milliseconds', async () => {
    const { sb } = setup();
    const points = Array.from({ length: 200 }, (_, i) => ({
      lat: 47.9813 + i * 1e-4, lng: 13.8269 + i * 1e-4, accuracy: 6.5, timestamp: new Date(1_760_000_000_000 + i * 15_000).toISOString(),
    }));
    const chunk = JSON.stringify({ taskId: '0199a0b1-0000-7000-8000-000000000001', points });
    await sb.write('warm', chunk, 'mike');
    await sb.read('warm', 'mike');
    const runs = 50;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) await sb.write('c', chunk, 'mike');
    const t1 = performance.now();
    for (let i = 0; i < runs; i++) await sb.read('c', 'mike');
    const t2 = performance.now();
    const seal = (t1 - t0) / runs;
    const open = (t2 - t1) / runs;
    // eslint-disable-next-line no-console
    console.log(`secure-buffer: ${chunk.length} B chunk — seal+write ${seal.toFixed(2)} ms, read+open ${open.toFixed(2)} ms (node)`);
    expect(seal).toBeLessThan(5);
    expect(open).toBeLessThan(5);
  });
});
