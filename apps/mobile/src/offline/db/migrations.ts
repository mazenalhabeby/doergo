/**
 * The offline database schema, as numbered steps.
 *
 * ⚠️ APPEND ONLY. A step that has run on a phone never runs again, so editing
 * one changes nothing on existing installs and silently diverges them from new
 * ones. Change the schema with a new step.
 *
 * The outbox and files tables hold work that exists nowhere else; entity copies
 * (`records`) can always be rebuilt from a pull. A step that must reshape
 * `records` may simply drop and recreate it and clear `sync_state`.
 */
export const MIGRATIONS: readonly string[] = [
  // 1 — foundation
  `
  CREATE TABLE IF NOT EXISTS outbox (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    op TEXT NOT NULL,
    lane TEXT NOT NULL,
    entity_id TEXT,
    depends_on TEXT NOT NULL,
    payload TEXT NOT NULL,
    evidence TEXT,
    state TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER,
    last_error TEXT,
    response TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS outbox_user_state ON outbox (user_id, state);
  CREATE INDEX IF NOT EXISTS outbox_entity ON outbox (entity_id);

  CREATE TABLE IF NOT EXISTS records (
    scope TEXT NOT NULL,
    id TEXT NOT NULL,
    parent_id TEXT,
    data TEXT NOT NULL,
    server_updated_at TEXT,
    PRIMARY KEY (scope, id)
  );
  CREATE INDEX IF NOT EXISTS records_parent ON records (scope, parent_id);

  CREATE TABLE IF NOT EXISTS sync_state (
    scope TEXT PRIMARY KEY NOT NULL,
    cursor TEXT,
    last_pull_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY NOT NULL,
    outbox_id TEXT,
    path TEXT NOT NULL,
    kind TEXT NOT NULL,
    mime TEXT,
    bytes INTEGER,
    width INTEGER,
    height INTEGER,
    taken_at INTEGER,
    state TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS files_outbox ON files (outbox_id);
  `,
  // 2 — a file remembers where it was uploaded, so a crash after the upload
  // and before the confirm does not upload it a second time.
  `
  ALTER TABLE files ADD COLUMN object_key TEXT;
  `,
];

/** Run every step past `current`, each in its own transaction, recording progress as it goes. */
export async function migrate(db: import('./sql').SqlDb): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  let version = row?.user_version ?? 0;
  for (let i = version; i < MIGRATIONS.length; i++) {
    await db.withTransactionAsync(async (txn) => {
      await txn.execAsync(MIGRATIONS[i]!);
      // PRAGMA cannot take a bound parameter; `i + 1` is an integer we produced.
      await txn.execAsync(`PRAGMA user_version = ${i + 1}`);
    });
    version = i + 1;
  }
  return version;
}
