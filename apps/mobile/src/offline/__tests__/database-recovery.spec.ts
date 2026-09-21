/**
 * A database the key no longer opens must not end offline mode forever.
 *
 * Found on a real phone: a 1.0.6 install whose engine threw
 * `ERR_INTERNAL_SQLITE_ERROR — file is not a database` on every launch, so the
 * app ran online-only and the Sync screen told the member to update an app
 * that was already current. The file lives in the app container and the key in
 * the keychain as THIS_DEVICE_ONLY, so restoring a phone from a backup brings
 * one back without the other — a healthy install meeting a file it can never
 * read. Nothing retried, nothing reported, and the member had no way out.
 */
import { databaseFailureText, openOfflineDatabase } from '../db/database';

const NOT_A_DB = Object.assign(new Error("Calling the 'execAsync' function has failed\n→ Caused by: file is not a database"), {
  code: 'ERR_INTERNAL_SQLITE_ERROR',
});

const execAsync = jest.fn();
const closeAsync = jest.fn().mockResolvedValue(undefined);
/*
  expo-sqlite REFUSES to delete a database whose handle is still in its open
  cache (SQLiteModule.swift: `findCachedDatabase(...) != nil` -> throw). The
  real module behaves that way, so the fake does too — without it the test
  passes while the phone does not, which is exactly what happened.
*/
const deleteDatabaseAsync = jest.fn(async () => {
  if (closeAsync.mock.calls.length === 0) throw new Error('database is still open');
});
const openDatabaseAsync = jest.fn(async (_name: string) => ({ execAsync, getAllAsync: jest.fn().mockResolvedValue([]), runAsync: jest.fn(), closeAsync }));

jest.mock('../native', () => ({ loadSQLite: () => ({ openDatabaseAsync, deleteDatabaseAsync }) }));
jest.mock('../../lib/optional-native', () => ({
  expoCrypto: () => ({
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: async () => 'a'.repeat(64),
    getRandomBytes: (n: number) => getRandomBytes(n),
  }),
}));
const store = new Map<string, string>();
let entropy = 0;
const getRandomBytes = jest.fn((n: number) => Uint8Array.from({ length: n }, () => (entropy++ * 37) % 251));
const setItemAsync = jest.fn(async (k: string, v: string) => void store.set(k, v));
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async (k: string) => store.get(k) ?? (k.startsWith('hbc_offline_key_') ? 'b'.repeat(64) : null)),
  setItemAsync: (...args: [string, string]) => setItemAsync(...args),
  deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
}));
jest.mock('../db/migrations', () => ({ migrate: jest.fn().mockResolvedValue(undefined) }));
jest.mock('expo-file-system', () => ({
  Paths: { document: '/doc' },
  File: class { exists = false; delete() {} },
}));

beforeEach(() => {
  jest.clearAllMocks();
  execAsync.mockReset();
  closeAsync.mockClear();
  store.clear();
  openDatabaseAsync.mockClear();
  setItemAsync.mockImplementation(async (k: string, v: string) => void store.set(k, v));
});

it('starts a new database when the key no longer decrypts the old one', async () => {
  // First connection: `PRAGMA key` lands, the next statement finds noise.
  execAsync.mockRejectedValueOnce(NOT_A_DB).mockResolvedValue(undefined);

  await expect(openOfflineDatabase('member-restored-from-backup')).resolves.toBeTruthy();
  expect(deleteDatabaseAsync).toHaveBeenCalledTimes(1);
  // The connection that failed must be closed, or the delete above is refused.
  expect(closeAsync).toHaveBeenCalled();
  // ⚠️ And the second open must use a DIFFERENT file. The recovery must not
  // depend on the delete succeeding — it has been refused on a real phone.
  const names = openDatabaseAsync.mock.calls.map(([name]) => name);
  expect(names).toHaveLength(2);
  expect(names[1]).not.toBe(names[0]);
});

it('recovers even when the old file cannot be deleted at all', async () => {
  deleteDatabaseAsync.mockRejectedValue(new Error('database is still open'));
  execAsync.mockRejectedValueOnce(NOT_A_DB).mockResolvedValue(undefined);

  await expect(openOfflineDatabase('member-whose-file-is-stuck')).resolves.toBeTruthy();
});

it('recovers from a differently worded error — the one that beat two releases', async () => {
  /*
    The real phone said this, not "file is not a database". A recovery gated on
    a recognised message did nothing, twice, while looking correct.
  */
  const wrapped = Object.assign(new Error("Call to function 'NativeDatabase.execAsync' has been rejected"), {
    cause: new Error('file is not a database'),
  });
  execAsync.mockRejectedValueOnce(wrapped).mockResolvedValue(undefined);

  await expect(openOfflineDatabase('member-with-the-wrapped-error')).resolves.toBeTruthy();
});

it('reports the cause, not the wrapper expo puts around it', () => {
  const wrapped = Object.assign(new Error("Call to function 'NativeDatabase.execAsync' has been rejected"), {
    code: 'ERR_INTERNAL_SQLITE_ERROR',
    cause: new Error('file is not a database'),
  });
  const text = databaseFailureText(wrapped);
  expect(text).toContain('file is not a database');
  expect(text).toContain('ERR_INTERNAL_SQLITE_ERROR');
});

it('names the replacement unpredictably, never base + 1', async () => {
  /*
    ⚠️ The failure that cost a release. The key and the recovery marker live in
    the SAME store, so when that store cannot keep values the key differs every
    launch AND the marker never advances. A COUNTER then picks the same "fresh"
    name every time — the one the previous launch created under a different key
    — and the recovery fails on its own wreckage, which is exactly what a real
    phone reported. A name drawn from random bytes cannot collide with an
    earlier attempt whether or not anything persisted.
  */
  setItemAsync.mockImplementation(async () => undefined); // every write vanishes
  execAsync.mockRejectedValueOnce(NOT_A_DB).mockResolvedValue(undefined);

  await expect(openOfflineDatabase('member-with-a-broken-store')).resolves.toBeTruthy();

  const [first, replacement] = openDatabaseAsync.mock.calls.map(([name]) => name);
  expect(replacement).not.toBe(first);
  expect(replacement).not.toBe(first.replace(/\.db$/, '_1.db'));
  // Drawn from random bytes, so two phones in the same state never agree.
  expect(getRandomBytes).toHaveBeenCalled();
});

it('gives up rather than looping when the fresh database fails the same way', async () => {
  execAsync.mockRejectedValue(NOT_A_DB);

  await expect(openOfflineDatabase('member-with-a-deeper-fault')).rejects.toThrow(/not a database/i);
  // Deleted once, retried once, then surfaced — never a loop.
  expect(deleteDatabaseAsync).toHaveBeenCalledTimes(1);
});
