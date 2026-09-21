/**
 * An encrypted database is only readable on the connection that was given the key.
 *
 * ⚠️ THE BUG THIS EXISTS FOR — the offline engine never started on ANY phone.
 *
 * expo-sqlite's `withExclusiveTransactionAsync` opens a SECOND native
 * connection (`Transaction.createAsync` sets `useNewConnection: true`). That
 * connection has never run `PRAGMA key`, so on a SQLCipher database it reads
 * the file as noise and throws "file is not a database". Migration is the
 * first thing that runs after keying, so the failure was total and looked for
 * all the world like a corrupt file: the app reported
 *
 *   ERR_INTERNAL_SQLITE_ERROR ... → Caused by: file is not a database
 *
 * on a database it had just created, on every phone, from the day it shipped.
 * Five releases were spent deleting and recreating files that were never the
 * problem.
 */
import * as fs from 'fs';
import * as path from 'path';

const OFFLINE = path.resolve(__dirname, '..');

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') sources(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Comments name the forbidden call constantly — this file and sql.ts included. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

it('never opens a transaction on a second connection', () => {
  const offenders = sources(OFFLINE)
    .filter((f) => strip(fs.readFileSync(f, 'utf8')).includes('withExclusiveTransactionAsync'))
    .map((f) => path.relative(OFFLINE, f));

  expect(offenders).toEqual([]);
});

it('runs the transaction body on the SAME connection that holds the key', async () => {
  const { openOfflineDatabase } = require('../db/database');
  const db = await openOfflineDatabase('member');
  const statements: string[] = [];
  execAsync.mockImplementation(async (sql: string) => void statements.push(sql));

  let inner: unknown;
  await db!.withTransactionAsync(async (txn: unknown) => {
    inner = txn;
    await (txn as { execAsync: (s: string) => Promise<void> }).execAsync('SELECT 1');
  });

  // The handle handed to the body is the keyed one, not a new connection.
  expect(inner).toBe(db);
  expect(statements).toEqual(['BEGIN IMMEDIATE', 'SELECT 1', 'COMMIT']);
  // And no second database was ever opened for it.
  expect(openDatabaseAsync).toHaveBeenCalledTimes(1);
});

const execAsync = jest.fn();
const openDatabaseAsync = jest.fn(async (_name: string) => ({
  execAsync,
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  runAsync: jest.fn(),
  closeAsync: jest.fn(),
}));
jest.mock('../native', () => ({ loadSQLite: () => ({ openDatabaseAsync, deleteDatabaseAsync: jest.fn() }) }));
jest.mock('../../lib/optional-native', () => ({
  expoCrypto: () => ({
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: async () => 'a'.repeat(64),
    getRandomBytes: (n: number) => new Uint8Array(n).fill(3),
  }),
}));
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async (k: string) => (k.startsWith('hbc_offline_key_') ? 'b'.repeat(64) : null)),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock('expo-file-system', () => ({ Paths: { document: '/doc' }, File: class { exists = false; delete() {} } }));
jest.mock('../db/migrations', () => ({ migrate: jest.fn().mockResolvedValue(undefined) }));
