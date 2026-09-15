/**
 * Migration safety check — the rule that makes an automatic rollback safe.
 *
 * A release rolls back by starting the PREVIOUS images against the SAME
 * database. That only works if every migration the new release applied is one
 * the old code can live with: a new table it never reads, a new column it never
 * writes, a new index. Anything that removes, renames or retypes something the
 * old code uses turns "roll back the code" into "restore the database", which
 * loses every write since the backup.
 *
 * So new migration files must be ADDITIVE. This refuses:
 *   · DROP TABLE / COLUMN / TYPE / SCHEMA / SEQUENCE / DOMAIN / EXTENSION, TRUNCATE
 *   · ALTER COLUMN … TYPE (a retype)
 *   · RENAME of a table, a column, an enum value or a type
 *   · ADD COLUMN … NOT NULL with no DEFAULT on a table that already exists
 *   · SET NOT NULL on a table that already exists
 *   · enum value removal (Prisma's `CREATE TYPE "X_new"` swap, or pg_enum edits)
 *   · DELETE FROM with no WHERE
 *   · editing or deleting a migration that already exists
 *
 * A human overrides it for one file with a line in that file:
 *
 *     -- release: destructive-approved <the reason, in words>
 *
 * The reason is required. It is what the next person reads when they wonder
 * why a rollback of that release needed a restore.
 *
 * Usage:
 *   node tools/release/check-migrations.ts --base origin/main [--head HEAD]
 *   node tools/release/check-migrations.ts --files path/to/migration.sql …
 *
 * Plain Node (22+, type stripping): no dependencies, so it runs anywhere.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export type Severity = 'error' | 'warning';

export interface Finding {
  file: string;
  severity: Severity;
  rule: string;
  message: string;
  statement: string;
}

export interface FileResult {
  file: string;
  findings: Finding[];
  /** The override reason, when the file carries a valid marker. */
  approvedReason: string | null;
}

export const DEFAULT_MIGRATIONS_DIR = 'apps/api/auth-service/prisma/migrations';

const MARKER = /^\s*--\s*release:\s*destructive-approved\b[ \t]*(.*)$/im;
const MIN_REASON_LENGTH = 10;

// ─── SQL normalisation ──────────────────────────────────────────────────────

/**
 * Remove comments and the CONTENT of single-quoted strings, and unwrap
 * dollar-quoted bodies so the statements inside a DO block are checked like any
 * other. A `RAISE WARNING 'DROP TABLE …'` must not trip the check, and a
 * `DO $$ BEGIN ALTER TABLE … DROP COLUMN …; END $$` must.
 */
export function normaliseSql(sql: string): string {
  let out = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') { depth++; i += 2; continue; }
        if (sql[i] === '*' && sql[i + 1] === '/') { depth--; i += 2; continue; }
        i++;
      }
      out += ' ';
      continue;
    }
    if (c === "'") {
      i++;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; }
        if (sql[i] === "'") { i++; break; }
        i++;
      }
      out += "''";
      continue;
    }
    if (c === '$') {
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (m) {
        // Keep the body as code: a DO block's statements are real statements.
        out += ' ';
        i += m[0].length;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

/** Split normalised SQL into statement fragments on `;`, whitespace-collapsed. */
export function splitStatements(normalised: string): string[] {
  return normalised
    .split(';')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0);
}

const IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][\w$]*)`;
const QUALIFIED = String.raw`${IDENT}(?:\s*\.\s*${IDENT})?`;

function unquote(ident: string): string {
  const last = ident.split('.').pop()!.trim();
  return last.replace(/^"|"$/g, '').toLowerCase();
}

/** Tables this migration creates: constraints on those are not a rollback risk. */
export function createdTables(statements: string[]): Set<string> {
  const re = new RegExp(String.raw`\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(${QUALIFIED})`, 'gi');
  const set = new Set<string>();
  for (const s of statements) {
    for (const m of s.matchAll(re)) set.add(unquote(m[1]));
  }
  return set;
}

/** Split an ALTER TABLE's action list on top-level commas. */
function splitActions(actions: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  let inQuote = false;
  for (const ch of actions) {
    if (ch === '"') inQuote = !inQuote;
    if (!inQuote) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

export function analyzeMigration(sql: string, file = '<inline>'): FileResult {
  const findings: Finding[] = [];
  const statements = splitStatements(normaliseSql(sql));
  const created = createdTables(statements);

  const add = (severity: Severity, rule: string, message: string, statement: string) =>
    findings.push({ file, severity, rule, message, statement: statement.slice(0, 240) });

  for (const s of statements) {
    // ── Removals ──
    let m: RegExpMatchArray | null;
    if ((m = new RegExp(String.raw`\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(${QUALIFIED})`, 'i').exec(s))) {
      add('error', 'drop-table', `drops table ${m[1]} — the previous release still reads it`, s);
    }
    if ((m = /\bDROP\s+(SCHEMA|TYPE|DOMAIN|SEQUENCE|EXTENSION)\b/i.exec(s))) {
      add('error', `drop-${m[1].toLowerCase()}`, `drops a ${m[1].toUpperCase()} — not reversible by rolling back code`, s);
    }
    if ((m = /\bDROP\s+(VIEW|MATERIALIZED\s+VIEW|FUNCTION|TRIGGER|PROCEDURE)\b/i.exec(s))) {
      add('warning', 'drop-object', `drops a ${m[1].toUpperCase()} — make sure the previous release does not use it`, s);
    }
    if (/\bDROP\s+INDEX\b/i.test(s)) {
      add('warning', 'drop-index', 'drops an index — safe for data, but check the previous release does not depend on its uniqueness', s);
    }
    if (/\bTRUNCATE\b/i.test(s)) {
      add('error', 'truncate', 'TRUNCATE deletes every row', s);
    }
    if (/\bDELETE\s+FROM\b/i.test(s)) {
      if (/\bDELETE\s+FROM\s+(?:ONLY\s+)?(?:"?pg_catalog"?\s*\.\s*)?"?pg_enum"?/i.test(s)) {
        add('error', 'enum-value-removal', 'deletes from pg_enum — removes an enum value the previous release may write', s);
      } else if (!/\bWHERE\b/i.test(s)) {
        add('error', 'delete-all', 'DELETE with no WHERE deletes every row', s);
      } else {
        add('warning', 'delete-rows', 'deletes rows — data that a rollback cannot bring back', s);
      }
    }

    // ── Enum swap (Prisma's way of removing an enum value) ──
    if ((m = new RegExp(String.raw`\bCREATE\s+TYPE\s+(${QUALIFIED})\s+AS\s+ENUM`, 'i').exec(s)) && /_new"?$/i.test(m[1].trim())) {
      add('error', 'enum-value-removal', `recreates enum as ${m[1]} — the swap Prisma generates to REMOVE enum values`, s);
    }

    // ── Renames ──
    if (/\bALTER\s+TYPE\b/i.test(s) && /\bRENAME\s+VALUE\b/i.test(s)) {
      add('error', 'rename-enum-value', 'renames an enum value — the previous release still writes the old one', s);
    } else if (/\bALTER\s+TYPE\b[^]*\bRENAME\s+TO\b/i.test(s)) {
      add('error', 'rename-type', 'renames a type', s);
    }
    if (/\bALTER\s+INDEX\b[^]*\bRENAME\b/i.test(s) || /\bRENAME\s+CONSTRAINT\b/i.test(s)) {
      add('warning', 'rename-index', 'renames an index or constraint — harmless for data, check nothing refers to it by name', s);
    }

    const alter = new RegExp(String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(${QUALIFIED})\s+(.*)$`, 'i').exec(s);
    if (alter) {
      const table = unquote(alter[1]);
      const isNew = created.has(table);
      const actions = alter[2];

      if (/^RENAME\s+TO\b/i.test(actions)) {
        add('error', 'rename-table', `renames table ${alter[1]}`, s);
      } else if (new RegExp(String.raw`^RENAME\s+(?:COLUMN\s+)?(?!CONSTRAINT\b)${IDENT}\s+TO\b`, 'i').test(actions)) {
        add('error', 'rename-column', `renames a column of ${alter[1]} — the previous release still uses the old name`, s);
      }

      for (const action of splitActions(actions)) {
        // DROP [COLUMN] [IF EXISTS] name  (COLUMN is optional in Postgres)
        const drop = /^DROP\s+(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?(\S+)/i.exec(action);
        if (drop && !/^DROP\s+(CONSTRAINT|DEFAULT|NOT\s+NULL|IDENTITY|EXPRESSION)\b/i.test(action)) {
          if (!isNew) add('error', 'drop-column', `drops column ${drop[1]} of ${alter[1]} — the previous release still reads it`, s);
        }
        if (/^ALTER\s+(?:COLUMN\s+)?\S+\s+(?:SET\s+DATA\s+)?TYPE\b/i.test(action)) {
          if (!isNew) add('error', 'alter-column-type', `retypes a column of ${alter[1]}`, s);
        }
        if (/^ALTER\s+(?:COLUMN\s+)?\S+\s+SET\s+NOT\s+NULL\b/i.test(action)) {
          if (!isNew) add('error', 'set-not-null', `makes a column of ${alter[1]} NOT NULL — the previous release may still write NULL`, s);
        }
        const addCol = /^ADD\s+(?!CONSTRAINT\b|PRIMARY\b|UNIQUE\b|FOREIGN\b|CHECK\b|EXCLUDE\b)(?:COLUMN\s+)?(IF\s+NOT\s+EXISTS\s+)?(\S+)(.*)$/i.exec(action);
        if (addCol) {
          const rest = addCol[3].toUpperCase();
          const notNull = /\bNOT\s+NULL\b/.test(rest);
          const hasDefault = /\bDEFAULT\b/.test(rest) || /\bGENERATED\b/.test(rest) || /\b(SMALL|BIG)?SERIAL\b/.test(rest);
          if (notNull && !hasDefault && !isNew) {
            add('error', 'add-not-null-without-default', `adds NOT NULL column ${addCol[2]} to ${alter[1]} with no DEFAULT — fails on existing rows and breaks the previous release's inserts`, s);
          }
          if (!addCol[1] && !isNew) {
            add('warning', 'not-idempotent', `ADD COLUMN ${addCol[2]} without IF NOT EXISTS — migrations here are hand-authored and should be safe to re-run`, s);
          }
        }
        if (/^ADD\s+(?:CONSTRAINT\s+\S+\s+)?(UNIQUE|FOREIGN\s+KEY|CHECK)\b/i.test(action) && !isNew) {
          add('warning', 'constraint-on-existing-table', `adds a constraint to existing table ${alter[1]} — existing rows that violate it stop the migration, and with it every service start`, s);
        }
      }
    }

    // ── Idempotence and risky additions ──
    if (/\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?!IF\s+NOT\s+EXISTS\b)/i.test(s)) {
      add('warning', 'not-idempotent', 'CREATE TABLE without IF NOT EXISTS', s);
    }
    if ((m = new RegExp(String.raw`\bCREATE\s+(UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(IF\s+NOT\s+EXISTS\s+)?(?:${IDENT}\s+)?ON\s+(?:ONLY\s+)?(${QUALIFIED})`, 'i').exec(s))) {
      if (!m[2]) add('warning', 'not-idempotent', 'CREATE INDEX without IF NOT EXISTS', s);
      if (m[1] && !created.has(unquote(m[3]))) {
        add('warning', 'unique-index-on-existing-table', `unique index on existing table ${m[3]} — duplicates already in it stop the migration`, s);
      }
    }
  }

  // ── The human override ──
  const marker = MARKER.exec(sql);
  let approvedReason: string | null = null;
  if (marker) {
    const reason = marker[1].trim();
    if (reason.length < MIN_REASON_LENGTH) {
      findings.push({
        file,
        severity: 'error',
        rule: 'approval-without-reason',
        message: `the destructive-approved marker needs a reason of at least ${MIN_REASON_LENGTH} characters`,
        statement: marker[0].trim(),
      });
    } else {
      approvedReason = reason;
    }
  }
  return { file, findings, approvedReason };
}

/** Errors that still block after the override is applied. */
export function blockingErrors(result: FileResult): Finding[] {
  return result.findings.filter(
    (f) => f.severity === 'error' && (result.approvedReason === null || f.rule === 'approval-without-reason'),
  );
}

// ─── Which files are new ────────────────────────────────────────────────────

export interface MigrationChange {
  status: 'added' | 'modified' | 'deleted';
  path: string;
}

/** Parse `git diff --name-status --no-renames` output, keeping migration SQL only. */
export function parseNameStatus(output: string, dir = DEFAULT_MIGRATIONS_DIR): MigrationChange[] {
  const changes: MigrationChange[] = [];
  for (const line of output.split('\n')) {
    const [code, ...rest] = line.trim().split(/\t/);
    const path = rest.join('\t');
    if (!code || !path) continue;
    if (!path.startsWith(dir.replace(/\/$/, '') + '/') || !path.endsWith('.sql')) continue;
    const status = code.startsWith('A') ? 'added' : code.startsWith('D') ? 'deleted' : 'modified';
    changes.push({ status, path });
  }
  return changes;
}

export interface CheckReport {
  results: FileResult[];
  structural: Finding[];
}

export function checkChanges(changes: MigrationChange[], read: (path: string) => string): CheckReport {
  const results: FileResult[] = [];
  const structural: Finding[] = [];
  for (const change of changes) {
    if (change.status === 'deleted') {
      structural.push({
        file: change.path,
        severity: 'error',
        rule: 'migration-deleted',
        message: 'an existing migration was deleted — production has already applied it; a deleted file makes `migrate deploy` report drift',
        statement: '',
      });
      continue;
    }
    const sql = read(change.path);
    const result = analyzeMigration(sql, change.path);
    if (change.status === 'modified' && result.approvedReason === null) {
      result.findings.push({
        file: change.path,
        severity: 'error',
        rule: 'migration-modified',
        message: 'an existing migration was edited — production will never re-run it, so the edit silently does nothing there. Write a new migration instead',
        statement: '',
      });
    }
    results.push(result);
  }
  return { results, structural };
}

export function reportIsBlocking(report: CheckReport): boolean {
  return report.structural.length > 0 || report.results.some((r) => blockingErrors(r).length > 0);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function annotate(f: Finding, level: 'error' | 'warning' | 'notice'): string {
  const msg = `[${f.rule}] ${f.message}${f.statement ? ` :: ${f.statement}` : ''}`.replace(/\r?\n/g, ' ');
  return process.env.GITHUB_ACTIONS === 'true' ? `::${level} file=${f.file}::${msg}` : `  ${level.toUpperCase()} ${f.file}\n    ${msg}`;
}

export function main(argv: string[]): number {
  const arg = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const dir = arg('--dir') ?? DEFAULT_MIGRATIONS_DIR;
  let changes: MigrationChange[];

  const filesIdx = argv.indexOf('--files');
  if (filesIdx >= 0) {
    changes = argv.slice(filesIdx + 1).filter((p) => !p.startsWith('--')).map((path) => ({ status: 'added' as const, path }));
  } else {
    const base = arg('--base');
    const head = arg('--head') ?? 'HEAD';
    if (!base) {
      console.error('usage: check-migrations.ts --base <ref> [--head <ref>] | --files <sql…>');
      return 2;
    }
    let from = base;
    try {
      from = git(['merge-base', base, head]).trim();
    } catch {
      // Unrelated or shallow history: compare trees directly.
    }
    changes = parseNameStatus(git(['diff', '--name-status', '--no-renames', from, head, '--', dir]), dir);
    // Read from the HEAD tree, not the working copy, so --head <sha> means that sha.
    const readAt = (path: string) => (head === 'HEAD' && existsSync(path) ? readFileSync(path, 'utf8') : git(['show', `${head}:${path}`]));
    return finish(checkChanges(changes, readAt), changes.length);
  }
  return finish(checkChanges(changes, (p) => readFileSync(resolve(p), 'utf8')), changes.length);
}

function finish(report: CheckReport, count: number): number {
  console.log(`check-migrations: ${count} changed migration file(s)`);
  for (const f of report.structural) console.log(annotate(f, 'error'));
  for (const r of report.results) {
    const blocking = blockingErrors(r);
    for (const f of r.findings) {
      if (f.severity === 'warning') console.log(annotate(f, 'warning'));
      else if (blocking.includes(f)) console.log(annotate(f, 'error'));
      else console.log(annotate(f, 'notice'));
    }
    if (r.approvedReason && r.findings.some((f) => f.severity === 'error')) {
      console.log(`  APPROVED ${r.file}: destructive change approved — "${r.approvedReason}"`);
    }
  }
  if (reportIsBlocking(report)) {
    console.log(
      '\nRefused: a release must be rollback-safe, so migrations must be additive.\n' +
        'Split the change (add now, remove in a later release once nothing reads it), or,\n' +
        'if a human has decided a restore-based rollback is acceptable, add to the file:\n' +
        '    -- release: destructive-approved <reason>',
    );
    return 1;
  }
  console.log('check-migrations: OK');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('check-migrations.ts')) {
  process.exit(main(process.argv.slice(2)));
}
