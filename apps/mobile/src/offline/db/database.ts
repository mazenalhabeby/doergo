import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { loadSQLite } from '../native';
import { migrate } from './migrations';
import type { SqlDb } from './sql';

/**
 * One encrypted database per signed-in member.
 *
 * ⚠️ Per MEMBER, not per phone. A shared van phone signed in by two people must
 * never let one see — or send — the other's queued work. Separate files make
 * that structural rather than a WHERE clause someone forgets.
 *
 * ⚠️ The key lives in the keystore with AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY, the
 * same class as the session tokens, so background sync can open the database
 * while the phone is locked — and a backup restored to another phone cannot.
 */
const KEY_PREFIX = 'hbc_offline_key_';
const open = new Map<string, Promise<SqlDb>>();

/** File name from the member id: stable, filesystem-safe, and not the id itself. */
async function fileNameFor(userId: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `hbcfield-offline:${userId}`);
  return `hbc_${digest.slice(0, 32)}.db`;
}

async function keyFor(userId: string): Promise<string> {
  const name = `${KEY_PREFIX}${userId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
  const existing = await SecureStore.getItemAsync(name);
  if (existing && /^[0-9a-f]{64}$/.test(existing)) return existing;
  const key = Array.from(Crypto.getRandomBytes(32), (b) => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(name, key, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  return key;
}

/**
 * The member's offline database, opened and migrated. Null on a build without
 * the native module — callers stay online-only.
 */
export function openOfflineDatabase(userId: string): Promise<SqlDb> | null {
  const lib = loadSQLite();
  if (!lib) return null;
  let pending = open.get(userId);
  if (!pending) {
    pending = (async () => {
      const [fileName, key] = await Promise.all([fileNameFor(userId), keyFor(userId)]);
      const db = (await lib.openDatabaseAsync(fileName)) as unknown as SqlDb;
      // The key must be the FIRST statement on a SQLCipher connection. The value
      // is 64 hex characters we generated — never user input.
      await db.execAsync(`PRAGMA key = "x'${key}'"`);
      await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      await migrate(db);
      return db;
    })();
    // A failed open must not be cached forever.
    pending.catch(() => open.delete(userId));
    open.set(userId, pending);
  }
  return pending;
}

/**
 * Close and delete a member's offline database and its key — on sign-out, once
 * nothing is left unsent. The file is gone, and the key that could read a copy
 * of it is gone too.
 */
export async function destroyOfflineDatabase(userId: string): Promise<void> {
  const lib = loadSQLite();
  const pending = open.get(userId);
  open.delete(userId);
  if (pending) {
    const db = await pending.catch(() => null);
    await db?.closeAsync().catch(() => undefined);
  }
  if (lib) {
    await lib.deleteDatabaseAsync(await fileNameFor(userId)).catch(() => undefined);
  }
  await SecureStore.deleteItemAsync(`${KEY_PREFIX}${userId.replace(/[^A-Za-z0-9_-]/g, '_')}`).catch(() => undefined);
}
