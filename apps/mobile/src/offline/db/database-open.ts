import { File as FsFile, Paths } from 'expo-file-system';
import { loadSQLite } from '../native';
import { migrate } from './migrations';
import type { SqlDb } from './sql';

/**
 * Opening one encrypted file: the keyed connection, the cipher check, and removing
 * an unreadable file — moved here unchanged from database.ts.
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
/** The database library on this build cannot encrypt. Never recovered from by starting a new file — a new file would be plaintext too. */
export class SqlCipherMissingError extends Error {
  readonly code = 'SQLCIPHER_MISSING';
  constructor(readonly cipher: string) {
    super(`SQLCipher is not in this build (cipher_version: ${cipher}) — refusing to store data unencrypted`);
    this.name = 'SqlCipherMissingError';
  }
}

/** Does `PRAGMA cipher_version` name a SQLCipher release? */
export function isSqlCipher(cipherVersion: string | null | undefined): boolean {
  return !!cipherVersion && cipherVersion !== 'NO SQLCIPHER' && /\d/.test(cipherVersion);
}

export async function cipherVersion(db: SqlDb): Promise<string> {
  try {
    const rows = await (db as unknown as { getAllAsync: (sql: string) => Promise<unknown[]> }).getAllAsync(
      'PRAGMA cipher_version;',
    );
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
export function keyedConnection(raw: SqlDb): SqlDb {
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

export async function openEncrypted(
  lib: NonNullable<ReturnType<typeof loadSQLite>>,
  fileName: string,
  key: string,
): Promise<SqlDb> {
  const raw = (await lib.openDatabaseAsync(fileName)) as unknown as SqlDb;
  const db = keyedConnection(raw);
  // Which step failed, carried out with the error. Four releases were spent not
  // knowing whether the key was rejected, the keying silently did nothing, or
  // the schema was at fault — they fail with the same sentence.
  let step = 'cipher_version';
  let cipher = '?';
  try {
    cipher = await cipherVersion(db);
    /*
      ⚠️ NO SQLCIPHER, NO DATABASE. On a build whose SQLite is not SQLCipher,
      `PRAGMA key` is silently ignored and every statement after it works — on a
      PLAINTEXT file holding the member's jobs, clients, photos' metadata and
      unsent clock-ins. That used to be logged and carried on with. It is now a
      refusal: the offline layer reports itself unavailable (the app works
      online, as on a build without it) rather than writing personal data to
      disk in the clear. Every real build has `useSQLCipher: true`
      (app.config.ts); Expo Go and a misconfigured build are what this catches.
    */
    if (!isSqlCipher(cipher)) throw new SqlCipherMissingError(cipher);
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
export async function discardDatabaseFiles(
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
