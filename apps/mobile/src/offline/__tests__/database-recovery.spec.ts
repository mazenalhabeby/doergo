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
import { openOfflineDatabase } from '../db/database';

const NOT_A_DB = Object.assign(new Error("Calling the 'execAsync' function has failed\n→ Caused by: file is not a database"), {
  code: 'ERR_INTERNAL_SQLITE_ERROR',
});

const execAsync = jest.fn();
const deleteDatabaseAsync = jest.fn().mockResolvedValue(undefined);
const openDatabaseAsync = jest.fn(async () => ({ execAsync, getAllAsync: jest.fn().mockResolvedValue([]), runAsync: jest.fn(), closeAsync: jest.fn() }));

jest.mock('../native', () => ({ loadSQLite: () => ({ openDatabaseAsync, deleteDatabaseAsync }) }));
jest.mock('../../lib/optional-native', () => ({
  expoCrypto: () => ({
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: async () => 'a'.repeat(64),
    getRandomBytes: () => new Uint8Array(32).fill(7),
  }),
}));
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn().mockResolvedValue('b'.repeat(64)),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../db/migrations', () => ({ migrate: jest.fn().mockResolvedValue(undefined) }));

beforeEach(() => {
  jest.clearAllMocks();
  execAsync.mockReset();
});

it('starts a new database when the key no longer decrypts the old one', async () => {
  // First connection: `PRAGMA key` lands, the next statement finds noise.
  execAsync.mockRejectedValueOnce(NOT_A_DB).mockResolvedValue(undefined);

  await expect(openOfflineDatabase('member-restored-from-backup')).resolves.toBeTruthy();
  expect(deleteDatabaseAsync).toHaveBeenCalledTimes(1);
});

it('does not delete the database for an unrelated failure', async () => {
  execAsync.mockRejectedValue(new Error('disk I/O error'));

  await expect(openOfflineDatabase('member-with-a-real-fault')).rejects.toThrow('disk I/O error');
  expect(deleteDatabaseAsync).not.toHaveBeenCalled();
});

it('gives up rather than looping when the fresh database fails the same way', async () => {
  execAsync.mockRejectedValue(NOT_A_DB);

  await expect(openOfflineDatabase('member-with-a-deeper-fault')).rejects.toThrow(/not a database/i);
  // Deleted once, retried once, then surfaced — never a loop.
  expect(deleteDatabaseAsync).toHaveBeenCalledTimes(1);
});
