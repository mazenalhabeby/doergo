import { File as FsFile, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { expoCrypto } from '../../lib/optional-native';
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
/*
  How many times this member's database has had to be abandoned.

  ⚠️ The recovery does NOT depend on deleting the old file. Deletion can be
  refused for reasons this code cannot see from here — expo-sqlite keeps open
  handles in a cache and throws rather than delete one, WAL leaves journals
  beside the file that the supported API does not touch, and the platform may
  simply say no. Every one of those turns a recovery into a no-op that looks
  like it ran, and the member is left exactly where they were. A phone did
  that twice in one afternoon.

  So the new database gets a NEW NAME and the old bytes are merely litter. The
  old file is still deleted when it can be, to reclaim the space.
*/
const GENERATION_PREFIX = 'hbc_offline_gen_';
const open = new Map<string, Promise<SqlDb>>();

/** File name from the member id: stable, filesystem-safe, and not the id itself. */
function crypto() {
  // offlineCapableBuild() checked for it before any database is opened.
  const lib = expoCrypto();
  if (!lib) throw new Error('expo-crypto is not in this build');
  return lib;
}

function safeName(prefix: string, userId: string): string {
  return `${prefix}${userId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

/**
 * Which file this member's database currently lives in — "" for the original.
 *
 * ⚠️ A COUNTER DOES NOT WORK HERE, and shipping one cost a release. If the
 * store cannot keep the value (which is the very fault being recovered from —
 * the key lives in the same store), every launch reads 0, bumps to 1, and
 * opens the `_1` file that the PREVIOUS launch created under a different key.
 * Predictable names collide with the wreckage of earlier attempts. A random
 * one cannot exist yet, so the retry is always a genuinely new database
 * whether or not anything persists.
 */
async function generationFor(userId: string): Promise<string> {
  const raw = await SecureStore.getItemAsync(safeName(GENERATION_PREFIX, userId)).catch(() => null);
  return raw && /^[0-9a-f]{1,16}$/.test(raw) ? raw : '';
}

async function bumpGeneration(userId: string): Promise<string> {
  const next = Array.from(crypto().getRandomBytes(4), (b) => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(safeName(GENERATION_PREFIX, userId), next, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  }).catch(() => undefined);
  return next;
}

async function fileNameFor(userId: string, generation = ''): Promise<string> {
  const Crypto = crypto();
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `hbcfield-offline:${userId}`);
  // No generation keeps the original name, so nothing moves for a healthy phone.
  return generation ? `hbc_${digest.slice(0, 32)}_${generation}.db` : `hbc_${digest.slice(0, 32)}.db`;
}

/**
 * Whether the key was READ BACK rather than freshly made.
 *
 * ⚠️ The single most useful fact when a database will not open. If this is
 * false on a phone that already has a database, the store is not keeping the
 * key and no amount of file handling will help — the next database will be
 * unreadable too. It is reported on screen for exactly that reason.
 */
let keyWasStored = false;

async function keyFor(userId: string): Promise<string> {
  const name = safeName(KEY_PREFIX, userId);
  const existing = await SecureStore.getItemAsync(name).catch(() => null);
  keyWasStored = !!(existing && /^[0-9a-f]{64}$/.test(existing));
  if (keyWasStored) return existing as string;
  const key = Array.from(crypto().getRandomBytes(32), (b) => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(name, key, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  return key;
}

/**
 * The member's offline database, opened and migrated. Null on a build without
 * the native module — callers stay online-only.
 */
/**
 * The whole reason a database failed, cause chain included.
 *
 * ⚠️ expo-modules wraps the real problem: the message begins "Call to function
 * 'NativeDatabase.execAsync' has been rejected" and the thing that actually
 * went wrong is in `cause`. Reading only `message` shows the wrapper and hides
 * the fault — which is exactly how a recovery came to be gated on a string
 * that a real phone never produced.
 */
export function databaseFailureText(err: unknown): string {
  const at = err as { step?: string; cipher?: string } | null;
  const parts: string[] = [];
  if (at?.step) parts.push(`at ${at.step} [cipher ${at.cipher}]`);
  let cur: unknown = err;
  for (let depth = 0; cur && depth < 5; depth++) {
    const e = cur as { message?: string; code?: string; cause?: unknown };
    const line = [e.code, e.message ?? (typeof cur === 'string' ? cur : undefined)].filter(Boolean).join(': ');
    if (line && !parts.includes(line)) parts.push(line);
    cur = e.cause;
  }
  return parts.join(' → ') || String(err);
}

/**
 * Is SQLCipher actually in this binary?
 *
 * ⚠️ `PRAGMA cipher_version` answers with a version string when the build has
 * encryption and NOTHING when it does not, and asking it is safe before the
 * key. It is reported on screen because the difference decides everything and
 * cannot be seen any other way: a plain SQLite build ignores `PRAGMA key`
 * silently, so a mis-built app looks exactly like a working one right up until
 * a database will not open.
 */
async function cipherVersion(db: SqlDb): Promise<string> {
  try {
    const rows = await (db as unknown as { getAllAsync: (sql: string) => Promise<unknown[]> }).getAllAsync('PRAGMA cipher_version;');
    const first = rows?.[0] as Record<string, unknown> | undefined;
    const value = first ? Object.values(first)[0] : undefined;
    return value ? String(value) : 'NO SQLCIPHER';
  } catch {
    return 'NO SQLCIPHER';
  }
}

/**
 * The keyed connection, with transactions that stay on it.
 *
 * ⚠️ This wrapper exists for one reason: expo-sqlite's
 * `withExclusiveTransactionAsync` opens a SECOND native connection, and a
 * second connection to an encrypted database has not been given the key. The
 * stores all wanted transactions, so they all got a connection that could not
 * read the file — and migration runs first, so nothing ever worked.
 *
 * BEGIN IMMEDIATE takes the write lock up front, which is what "exclusive" was
 * reaching for; it just does it without a new connection.
 */
function keyedConnection(raw: SqlDb): SqlDb {
  let depth = 0;
  const self: SqlDb = {
    execAsync: (source) => raw.execAsync(source),
    runAsync: (source, params) => raw.runAsync(source, params),
    getAllAsync: (source, params) => raw.getAllAsync(source, params),
    getFirstAsync: (source, params) => raw.getFirstAsync(source, params),
    closeAsync: () => raw.closeAsync(),
    async withTransactionAsync(task) {
      // A nested call joins the outer transaction rather than failing on a
      // second BEGIN, which SQLite refuses.
      if (depth > 0) {
        depth++;
        try {
          await task(self);
        } finally {
          depth--;
        }
        return;
      }
      depth = 1;
      await raw.execAsync('BEGIN IMMEDIATE');
      try {
        await task(self);
        await raw.execAsync('COMMIT');
      } catch (err) {
        await raw.execAsync('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        depth = 0;
      }
    },
  };
  return self;
}

async function openEncrypted(lib: NonNullable<ReturnType<typeof loadSQLite>>, fileName: string, key: string): Promise<SqlDb> {
  const raw = (await lib.openDatabaseAsync(fileName)) as unknown as SqlDb;
  const db = keyedConnection(raw);
  // Which step failed, carried out with the error. Four releases were spent not
  // knowing whether the key was rejected, the keying silently did nothing, or
  // the schema was at fault — they fail with the same sentence.
  let step = 'cipher_version';
  let cipher = '?';
  try {
    cipher = await cipherVersion(db);
    step = 'key';
    // The key must be the FIRST statement on a SQLCipher connection. The value
    // is 64 hex characters we generated — never user input.
    await db.execAsync(`PRAGMA key = "x'${key}'"`);
    step = 'journal_mode';
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    step = 'migrate';
    await migrate(db);
    return db;
  } catch (err) {
    // Carry the open connection out with the failure: the recovery has to close
    // it before the file can be deleted, and only this scope has it.
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), { db, step, cipher });
  }
}

/**
 * Remove an unreadable database, all of it.
 *
 * ⚠️ CLOSE IT FIRST. `deleteDatabaseAsync` refuses — it throws — while the
 * handle is still in expo-sqlite's open cache, and the open SUCCEEDED here: it
 * was the first statement that failed, so the connection is very much open.
 * Without this the delete is swallowed, the retry meets the same file, and the
 * recovery looks like it ran and changed nothing. It did exactly that once.
 *
 * ⚠️ AND THE SIDECARS. WAL leaves `-wal` and `-shm` beside the database and
 * `deleteDatabaseAsync` removes only the main file; a stale journal left next
 * to a fresh database is replayed into it, which is a new way to arrive at the
 * same error. expo-sqlite has no API for them, so they go directly.
 */
async function discardDatabaseFiles(
  lib: NonNullable<ReturnType<typeof loadSQLite>>,
  failed: unknown,
  fileName: string,
): Promise<void> {
  const db = (failed as { db?: { closeAsync?: () => Promise<void> } })?.db;
  await db?.closeAsync?.().catch(() => undefined);
  await lib.deleteDatabaseAsync(fileName).catch(() => undefined);
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      const file = new FsFile(Paths.document, 'SQLite', `${fileName}${suffix}`);
      if (file.exists) file.delete();
    } catch {
      // Best effort: the main file is gone through the supported path already.
    }
  }
}

export function openOfflineDatabase(userId: string): Promise<SqlDb> | null {
  const lib = loadSQLite();
  if (!lib) return null;
  let pending = open.get(userId);
  if (!pending) {
    pending = (async () => {
      const [generation, key] = await Promise.all([generationFor(userId), keyFor(userId)]);
      const fileName = await fileNameFor(userId, generation);
      try {
        return await openEncrypted(lib, fileName, key);
      } catch (err) {
        /*
          ⚠️ ANY failure, not a recognised one.

          This used to fire only on "file is not a database", the message seen
          once in one log. The phone that mattered reported a differently
          worded error, so the recovery never ran while appearing to be in
          place — twice, across two releases. Matching error strings from a
          native module is guesswork; starting one fresh database is cheap and
          always safe, so it is no longer conditional on getting the guess
          right. Still ONCE: a second failure surfaces rather than loops.
        */
        /*
          ⚠️ Start again with an empty one. There is no other move: nothing on
          this phone or any other can decrypt those bytes, and the alternative
          is what this replaced — the whole offline layer dead for that member
          for the life of the install, behind a screen telling them to update an
          app that is already current. A real phone did exactly that.

          What is lost is what was already lost. `records` is a copy of the
          server and returns on the next pull; the outbox holds work that exists
          nowhere else, and it too was unreadable the moment the key stopped
          matching. Discarding it is not the damage, it is the aftermath.

          Once. A second failure on a file we just created is a different fault
          and must surface rather than loop.
        */
        const next = await bumpGeneration(userId);
        const freshName = await fileNameFor(userId, next);
        console.warn(`[offline] database unusable (${databaseFailureText(err)}) — starting a new one (${freshName})`);
        // Best effort, and deliberately NOT depended on: the fresh database has
        // a name nothing else has used, so a refused delete costs disk space.
        await discardDatabaseFiles(lib, err, fileName);
        try {
          return await openEncrypted(lib, freshName, key);
        } catch (again) {
          /*
            Both the existing database AND a file that has never been written
            failed. That is no longer a stale-file problem, and saying so is
            the difference between a fixable report and another afternoon: the
            screen shows this sentence, so it names what was actually tried.
          */
          throw Object.assign(
            new Error(`fresh database also failed (${databaseFailureText(again)}); key ${keyWasStored ? 'was stored' : 'IS NOT PERSISTING'}`),
            { db: (again as { db?: unknown })?.db },
          );
        }
      }
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
    // The original name and whichever one is in use now.
    const generation = await generationFor(userId);
    for (const g of generation ? ['', generation] : ['']) {
      await lib.deleteDatabaseAsync(await fileNameFor(userId, g)).catch(() => undefined);
    }
  }
  await SecureStore.deleteItemAsync(safeName(KEY_PREFIX, userId)).catch(() => undefined);
  await SecureStore.deleteItemAsync(safeName(GENERATION_PREFIX, userId)).catch(() => undefined);
}
