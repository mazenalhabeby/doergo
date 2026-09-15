import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  analyzeMigration,
  blockingErrors,
  checkChanges,
  parseNameStatus,
  reportIsBlocking,
  DEFAULT_MIGRATIONS_DIR,
} from './check-migrations.ts';

const rules = (sql: string) => analyzeMigration(sql).findings.map((f) => `${f.severity}:${f.rule}`);
const errors = (sql: string) => blockingErrors(analyzeMigration(sql)).map((f) => f.rule);

// ─── Allowed: what this project's migrations actually look like ─────────────

test('additive IF NOT EXISTS changes pass with no findings', () => {
  const sql = `
    -- a comment mentioning DROP TABLE "users" must not count
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "locale" TEXT;
    ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "noShiftPolicy" TEXT NOT NULL DEFAULT 'ALLOW';
    CREATE TABLE IF NOT EXISTS "time_entry_presence" (
      "id" TEXT NOT NULL,
      "timeEntryId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "time_entry_presence_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "tep_idx" ON "time_entry_presence" ("timeEntryId");
    DO $$ BEGIN
      ALTER TABLE "time_entry_presence" ADD CONSTRAINT "tep_fkey"
        FOREIGN KEY ("timeEntryId") REFERENCES "time_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'ON_HOLD';
    UPDATE "users" SET "locale" = NULL WHERE "locale" = '';
  `;
  assert.deepEqual(analyzeMigration(sql).findings, []);
});

test('a string literal containing destructive words is ignored', () => {
  assert.deepEqual(errors(`DO $$ BEGIN RAISE WARNING 'would DROP TABLE users; TRUNCATE x'; END $$;`), []);
});

test('NOT NULL without DEFAULT is fine on a table created in the same migration', () => {
  const sql = `CREATE TABLE IF NOT EXISTS "things" ("id" TEXT NOT NULL);
               ALTER TABLE "things" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL;
               ALTER TABLE "things" ALTER COLUMN "name" SET NOT NULL;`;
  assert.deepEqual(errors(sql), []);
});

test('DROP NOT NULL and DROP DEFAULT are not column drops', () => {
  assert.deepEqual(errors(`ALTER TABLE "users" ALTER COLUMN "x" DROP NOT NULL, ALTER COLUMN "y" DROP DEFAULT;`), []);
  assert.deepEqual(errors(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_x_key";`), []);
});

// ─── Refused ────────────────────────────────────────────────────────────────

test('DROP TABLE is refused, including inside a DO block', () => {
  assert.deepEqual(errors(`DROP TABLE IF EXISTS "org_roles";`), ['drop-table']);
  assert.ok(errors(`DO $$ BEGIN DROP TABLE "quotes" CASCADE; END $$;`).includes('drop-table'));
});

test('DROP COLUMN is refused, with or without the COLUMN keyword', () => {
  assert.deepEqual(errors(`ALTER TABLE "users" DROP COLUMN "platform";`), ['drop-column']);
  assert.deepEqual(errors(`ALTER TABLE "users" DROP COLUMN IF EXISTS "platform";`), ['drop-column']);
  assert.deepEqual(errors(`ALTER TABLE "users" DROP "platform";`), ['drop-column']);
  assert.deepEqual(errors(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "a" TEXT, DROP COLUMN "b";`), ['drop-column']);
});

test('a retype is refused', () => {
  assert.deepEqual(errors(`ALTER TABLE "tasks" ALTER COLUMN "status" TYPE TEXT USING "status"::text;`), ['alter-column-type']);
  assert.deepEqual(errors(`ALTER TABLE "tasks" ALTER COLUMN "status" SET DATA TYPE TEXT;`), ['alter-column-type']);
});

test('renames are refused', () => {
  assert.deepEqual(errors(`ALTER TABLE "teams" RENAME TO "spaces";`), ['rename-table']);
  assert.deepEqual(errors(`ALTER TABLE "users" RENAME COLUMN "teamId" TO "spaceId";`), ['rename-column']);
  assert.deepEqual(errors(`ALTER TABLE "users" RENAME "teamId" TO "spaceId";`), ['rename-column']);
  assert.deepEqual(errors(`ALTER TYPE "TaskCreationScope" RENAME VALUE 'TEAM' TO 'SPACE';`), ['rename-enum-value']);
  assert.deepEqual(errors(`ALTER TYPE "Role" RENAME TO "Role_old";`), ['rename-type']);
});

test('renaming an index or constraint is only a warning', () => {
  assert.deepEqual(rules(`ALTER INDEX "a_idx" RENAME TO "b_idx";`), ['warning:rename-index']);
  assert.deepEqual(errors(`ALTER TABLE "users" RENAME CONSTRAINT "a" TO "b";`), []);
});

test('NOT NULL without DEFAULT on an existing table is refused', () => {
  assert.deepEqual(errors(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tz" TEXT NOT NULL;`), ['add-not-null-without-default']);
  assert.deepEqual(errors(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tz" TEXT NOT NULL DEFAULT 'UTC';`), []);
  assert.deepEqual(errors(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "n" BIGSERIAL NOT NULL;`), []);
});

test('SET NOT NULL on an existing table is refused', () => {
  assert.deepEqual(errors(`ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;`), ['set-not-null']);
});

test('enum value removal is refused in both of its shapes', () => {
  const prismaSwap = `
    BEGIN;
    CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'EMPLOYEE');
    ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
    ALTER TYPE "Role" RENAME TO "Role_old";
    ALTER TYPE "Role_new" RENAME TO "Role";
    DROP TYPE "Role_old";
    COMMIT;`;
  const found = errors(prismaSwap);
  for (const rule of ['enum-value-removal', 'alter-column-type', 'rename-type', 'drop-type']) {
    assert.ok(found.includes(rule), `expected ${rule} in ${found.join(',')}`);
  }
  assert.deepEqual(errors(`DELETE FROM pg_enum WHERE enumlabel = 'OLD';`), ['enum-value-removal']);
});

test('TRUNCATE and DELETE without WHERE are refused; DELETE with WHERE warns', () => {
  assert.deepEqual(errors(`TRUNCATE "location_history";`), ['truncate']);
  assert.deepEqual(errors(`DELETE FROM "sessions";`), ['delete-all']);
  assert.deepEqual(rules(`DELETE FROM "sessions" WHERE "expiresAt" < now();`), ['warning:delete-rows']);
});

test('non-idempotent additions and risky constraints warn but do not block', () => {
  const sql = `ALTER TABLE "users" ADD COLUMN "a" TEXT;
               CREATE TABLE "b" ("id" TEXT);
               CREATE UNIQUE INDEX "users_a_key" ON "users" ("a");
               ALTER TABLE "users" ADD CONSTRAINT "u_fk" FOREIGN KEY ("x") REFERENCES "y"("id");`;
  assert.deepEqual(errors(sql), []);
  const found = rules(sql);
  assert.ok(found.includes('warning:not-idempotent'));
  assert.ok(found.includes('warning:unique-index-on-existing-table'));
  assert.ok(found.includes('warning:constraint-on-existing-table'));
});

// ─── The override ───────────────────────────────────────────────────────────

test('the destructive-approved marker with a reason lets the file through', () => {
  const sql = `-- release: destructive-approved worker_costs has had no reader since 2026-08-09
               DROP TABLE IF EXISTS "worker_costs";`;
  const result = analyzeMigration(sql);
  assert.equal(result.approvedReason, 'worker_costs has had no reader since 2026-08-09');
  assert.deepEqual(blockingErrors(result), []);
  // The finding is still reported, so the approval is visible.
  assert.deepEqual(result.findings.map((f) => f.rule), ['drop-table']);
});

test('the marker without a reason is itself an error, and approves nothing', () => {
  const result = analyzeMigration(`-- release: destructive-approved\nDROP TABLE "x";`);
  assert.equal(result.approvedReason, null);
  assert.deepEqual(blockingErrors(result).map((f) => f.rule).sort(), ['approval-without-reason', 'drop-table']);
  assert.equal(analyzeMigration(`-- release: destructive-approved ok\nDROP TABLE "x";`).approvedReason, null);
});

// ─── Which files count ──────────────────────────────────────────────────────

test('parseNameStatus keeps migration SQL and classifies the change', () => {
  const out = [
    `A\t${DEFAULT_MIGRATIONS_DIR}/20260917_x/migration.sql`,
    `M\t${DEFAULT_MIGRATIONS_DIR}/20260101_old/migration.sql`,
    `D\t${DEFAULT_MIGRATIONS_DIR}/20250101_gone/migration.sql`,
    `M\t${DEFAULT_MIGRATIONS_DIR}/migration_lock.toml`,
    `M\tapps/web-app/src/page.tsx`,
  ].join('\n');
  assert.deepEqual(parseNameStatus(out).map((c) => c.status), ['added', 'modified', 'deleted']);
});

test('editing or deleting an existing migration blocks', () => {
  const additive = `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "a" TEXT;`;
  const report = checkChanges(
    [
      { status: 'modified', path: 'm/old.sql' },
      { status: 'deleted', path: 'm/gone.sql' },
    ],
    () => additive,
  );
  assert.equal(reportIsBlocking(report), true);
  assert.deepEqual(report.structural.map((f) => f.rule), ['migration-deleted']);
  assert.deepEqual(report.results[0].findings.map((f) => f.rule), ['migration-modified']);

  const ok = checkChanges([{ status: 'added', path: 'm/new.sql' }], () => additive);
  assert.equal(reportIsBlocking(ok), false);
});

// ─── Calibration against this repository's real history ────────────────────

const repoRoot = join(import.meta.dirname, '..', '..');
const migrationsDir = join(repoRoot, DEFAULT_MIGRATIONS_DIR);

test('real destructive migrations from this repo are caught', { skip: !existsSync(migrationsDir) }, () => {
  const expect: Record<string, string> = {
    '20260807150000_drop_legacy_orgrole': 'drop-table',
    '20260506120000_rename_team_to_space_scope': 'rename-enum-value',
  };
  for (const [name, rule] of Object.entries(expect)) {
    const path = join(migrationsDir, name, 'migration.sql');
    if (!existsSync(path)) continue;
    const found = blockingErrors(analyzeMigration(readFileSync(path, 'utf8'), name)).map((f) => f.rule);
    assert.ok(found.includes(rule), `${name}: expected ${rule}, got ${found.join(',') || 'nothing'}`);
  }
});

test('the most recent additive migrations pass', { skip: !existsSync(migrationsDir) }, () => {
  const recent = [
    '20260916140000_user_locale',
    '20260915140000_work_presence',
    '20260914160000_one_open_shift_per_member',
    '20260915120000_no_shift_limit',
  ];
  const present = new Set(readdirSync(migrationsDir));
  for (const name of recent.filter((n) => present.has(n))) {
    const found = blockingErrors(analyzeMigration(readFileSync(join(migrationsDir, name, 'migration.sql'), 'utf8'), name));
    assert.deepEqual(found, [], `${name} should be additive`);
  }
});
