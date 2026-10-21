/**
 * Build a brand-new, EMPTY database that matches production — for a new developer
 * machine, a staging server or a throwaway test database.
 *
 *   DATABASE_URL=postgresql://…/new_db pnpm db:create-fresh
 *
 * Why this exists: `prisma migrate deploy` cannot build a database from zero. Early
 * on, some tables were created by syncing the schema directly rather than through a
 * migration, so the 2026-06-18 migration alters a table no migration ever created.
 * Production is fine (its history ran in order against those tables); only an
 * empty database fails.
 *
 * What it does — Prisma's "baselining":
 *   1. loads `schema.sql`, production's structure (tables, indexes, the sync
 *      tombstone triggers, the append-only audit trigger, extensions) — no data;
 *   2. records every migration up to the baseline as already applied, with the
 *      same checksum Prisma computes, so Prisma treats the history as run;
 *   3. runs `prisma migrate deploy`, which applies whatever came AFTER the baseline.
 *
 * It refuses to touch a database that already has tables.
 */
import { createHash, randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { readdirSync, readFileSync, writeFileSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const here = __dirname;
const prismaDir = join(here, '..');
const migrationsDir = join(prismaDir, 'migrations');
const schemaPrisma = join(prismaDir, 'schema.prisma');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set — point it at the NEW, empty database.');
  process.exit(1);
}

const baseline = readFileSync(join(here, 'schema.sql'), 'utf8');
const marker = /BASELINE_LAST_MIGRATION=(\S+)/.exec(baseline)?.[1];
if (!marker) throw new Error('schema.sql has no BASELINE_LAST_MIGRATION line');

const covered = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name <= marker)
  .map((d) => d.name)
  .sort();
if (!covered.includes(marker)) throw new Error(`baseline migration ${marker} is not in migrations/`);

const sqlString = (s: string) => `'${s.replace(/'/g, "''")}'`;
const applied = covered
  .map((name) => {
    // Prisma's checksum: SHA-256 of the migration file exactly as it is on disk.
    const checksum = createHash('sha256').update(readFileSync(join(migrationsDir, name, 'migration.sql'))).digest('hex');
    return `(${sqlString(randomUUID())}, ${sqlString(checksum)}, now(), ${sqlString(name)}, now(), 1)`;
  })
  .join(',\n');

const script = `
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'spatial_ref_sys') THEN
    RAISE EXCEPTION 'This database already has tables. create-fresh-db only builds an EMPTY database.';
  END IF;
END $$;
${baseline}
SELECT pg_catalog.set_config('search_path', 'public', false);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
VALUES
${applied};
`;

const file = join(mkdtempSync(join(tmpdir(), 'hbc-fresh-')), 'fresh.sql');
writeFileSync(file, script);

const prisma = (args: string[]) =>
  execFileSync('npx', ['prisma', ...args, '--schema', schemaPrisma], { stdio: 'inherit', env: process.env });

console.log(`Loading the production baseline (${covered.length} migrations up to ${marker})…`);
prisma(['db', 'execute', '--file', file]);
console.log('Applying migrations newer than the baseline…');
execFileSync('npx', ['prisma', 'migrate', 'deploy', '--schema', schemaPrisma], { stdio: 'inherit', env: process.env });
console.log('Done. Seed it with `pnpm db:seed` if you want sample data.');
