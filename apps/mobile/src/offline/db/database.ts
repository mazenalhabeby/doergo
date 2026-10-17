import * as SecureStore from 'expo-secure-store';
import { expoCrypto } from '../../lib/optional-native';
import { loadSQLite } from '../native';
import type { SqlDb } from './sql';
import { databaseFailureText, SqlCipherMissingError, openEncrypted, discardDatabaseFiles } from './database-open';
export { databaseFailureText, SqlCipherMissingError, isSqlCipher } from './database-open';

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
        // Not a broken file: a build that cannot encrypt. Close and refuse — never "start fresh" in plaintext.
        if (err instanceof SqlCipherMissingError) {
          await (err as { db?: SqlDb }).db?.closeAsync().catch(() => undefined);
          throw err;
        }
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
            new Error(
              `fresh database also failed (${databaseFailureText(again)}); key ${keyWasStored ? 'was stored' : 'IS NOT PERSISTING'}`,
            ),
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
