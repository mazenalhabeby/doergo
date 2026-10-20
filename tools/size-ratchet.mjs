#!/usr/bin/env node
/**
 * The size ratchet: files and lines may get SHORTER, never longer.
 *
 *   node tools/size-ratchet.mjs           check (exit 1 on a regression)
 *   node tools/size-ratchet.mjs --update  write the baseline DOWN to today's numbers
 *   node tools/size-ratchet.mjs --split <old file> <new files…>
 *                                         a move-only split: the new files take over the old
 *                                         file's long lines (never more in total), and no new
 *                                         file may be over 300 lines, unless named with
 *                                         --over <file> (one method too long to move apart;
 *                                         recorded at its size and ratcheted from there)
 *
 * Limits: a source file ≤ 300 lines, a line ≤ 140 characters. The 2,452-file
 * codebase had 365 files over 300 and ~4,860 lines over 140 on 2026-10-16 with
 * no rule at all, which is why they kept coming back (CODE_AUDIT.md §6).
 *
 * Existing offenders are recorded in tools/size-baseline.json with their numbers
 * that day. A recorded file fails when it GROWS (more lines while over 300, or
 * more long lines); a file not recorded fails when it is over either limit. So
 * nobody has to fix the past to land a change — only not make it worse.
 *
 * `--update` only ever lowers: a file that improved gets its smaller numbers, a
 * file now under both limits leaves the baseline, and a file that grew is
 * refused (raise the limit in review, never in a script).
 *
 * A written exception (docs/plans/code-structure-fix.md, Phase 0.1): a file whose
 * first lines carry `size-exempt: <reason of at least 20 characters>` may be up to
 * 600 lines. Cutting one cohesive file into numbered "-part2" pieces only to pass
 * the limit made the code harder to read, not easier — the reason is reviewed with
 * the change instead. Lines over 140 characters are never exempt.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_LINES = 300;
export const MAX_WIDTH = 140;
/** The most an exempt file may hold, so an exception never becomes a dumping ground. */
export const MAX_EXEMPT_LINES = 600;
const EXEMPT_RE = /size-exempt:\s*(.{20,})/;

/** The written reason, when one of the first 15 lines grants the exception. */
export function exemption(text) {
  const head = text.split('\n', 15).join('\n');
  const m = head.match(EXEMPT_RE);
  return m ? m[1].trim() : null;
}

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(REPO, 'tools', 'size-baseline.json');

const ROOTS = [
  'apps/api/auth-service/src',
  'apps/api/gateway/src',
  'apps/api/task-service/src',
  'apps/api/notification-service/src',
  'apps/api/tracking-service/src',
  'apps/web-app/src',
  'apps/mobile/src',
  'apps/mobile/app',
  'apps/admin/src',
  'packages/shared/src',
];
/** Tests, translations, generated code and content are not code to shape. */
const SKIP = [
  /\.spec\.tsx?$/,
  /\.test\.tsx?$/,
  /\/__tests__\//,
  /\/__mocks__\//,
  /\/locales\//,
  /\.d\.ts$/,
  /\/generated\//,
  /\/migrations\//,
  /app\/help\/_content\//,
];

function sourceFiles() {
  const listed = execSync(`git ls-files --cached --others --exclude-standard -- ${ROOTS.join(' ')}`, {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return listed
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f) && !SKIP.some((re) => re.test(f)) && existsSync(join(REPO, f)));
}

export function measure(text) {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const m = { lines: lines.length, long: lines.filter((l) => l.length > MAX_WIDTH).length };
  if (exemption(text)) m.exempt = true;
  return m;
}

function current() {
  const out = {};
  for (const f of sourceFiles()) out[f] = measure(readFileSync(join(REPO, f), 'utf8'));
  return out;
}

/** The line limit a file is held to: 300, or 600 with a written exception. */
const limitOf = (m) => (m.exempt ? MAX_EXEMPT_LINES : MAX_LINES);
const isOver = (m) => m.lines > limitOf(m) || m.long > 0;

export function compare(now, baseline) {
  const problems = [];
  for (const [f, m] of Object.entries(now)) {
    const b = baseline[f];
    const limit = limitOf(m);
    if (!b) {
      if (m.lines > limit)
        problems.push(
          `${f}: ${m.lines} lines (new file over ${limit}` +
            (m.exempt
              ? ', even with its size-exempt note)'
              : '; split it by meaning, or add a reviewed size-exempt: <reason>)'),
        );
      if (m.long > 0) problems.push(`${f}: ${m.long} line(s) over ${MAX_WIDTH} characters`);
      continue;
    }
    if (m.lines > limit && m.lines > b.lines)
      problems.push(`${f}: grew to ${m.lines} lines (was ${b.lines}, limit ${limit})`);
    if (m.long > b.long) problems.push(`${f}: ${m.long} lines over ${MAX_WIDTH} characters (was ${b.long})`);
  }
  return problems;
}

function split(baseline, now, args) {
  const over = new Set();
  const list = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--over') over.add(args[++i]);
    else list.push(args[i]);
  }
  const [from, ...rest] = list;
  const to = [...rest, ...over];
  const was = baseline[from];
  if (!was) throw new Error(`${from} is not in the baseline — nothing to hand over`);
  const moved = to.map((f) => [f, measure(readFileSync(join(REPO, f), 'utf8'))]);
  const tooBig = moved.filter(([f, m]) => m.lines > MAX_LINES && !over.has(f));
  if (tooBig.length)
    throw new Error(
      'a split must leave every file under ' +
        MAX_LINES +
        ' lines: ' +
        tooBig.map(([f, m]) => `${f} (${m.lines})`).join(', '),
    );
  const left = now[from] ?? { lines: 0, long: 0 };
  const total = left.long + moved.reduce((n, [, m]) => n + m.long, 0);
  if (total > was.long) throw new Error(`the split has ${total} long lines; ${from} had ${was.long}`);
  if (isOver(left)) baseline[from] = { lines: Math.min(was.lines, left.lines), long: left.long };
  else delete baseline[from];
  for (const [f, m] of moved) if (isOver(m)) baseline[f] = { lines: m.lines, long: m.long };
  const sorted = Object.fromEntries(
    Object.keys(baseline)
      .sort()
      .map((k) => [k, baseline[k]]),
  );
  writeFileSync(BASELINE, JSON.stringify(sorted, null, 1) + '\n');
  console.log(
    `size baseline: ${from} split into ${to.length} file(s); ${total} long line(s) carried (was ${was.long})`,
  );
}

function main() {
  const now = current();
  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
  const at = process.argv.indexOf('--split');
  if (at > 0) return split(baseline, now, process.argv.slice(at + 1));

  if (process.argv.includes('--update') || !baseline) {
    if (baseline) {
      const grew = compare(now, baseline);
      if (grew.length) {
        console.error('Refusing to raise the baseline:\n  ' + grew.join('\n  '));
        process.exit(1);
      }
    }
    const next = {};
    for (const f of Object.keys(now).sort()) {
      if (!isOver(now[f])) continue;
      const b = baseline?.[f];
      next[f] = b ? { lines: Math.min(b.lines, now[f].lines), long: Math.min(b.long, now[f].long) } : now[f];
      delete next[f].exempt;
    }
    writeFileSync(BASELINE, JSON.stringify(next, null, 1) + '\n');
    console.log(`size baseline: ${Object.keys(next).length} file(s) over the limits recorded`);
    return;
  }

  const problems = compare(now, baseline);
  if (problems.length) {
    console.error(
      `Size ratchet — files over ${MAX_LINES} lines or with lines over ${MAX_WIDTH} characters must not grow:\n  ` +
        problems.join('\n  '),
    );
    process.exit(1);
  }
  const improved = Object.keys(baseline).filter((f) => {
    const m = now[f];
    return !m || m.lines < baseline[f].lines || m.long < baseline[f].long;
  }).length;
  const exempt = Object.values(now).filter((m) => m.exempt).length;
  console.log(
    `size ratchet: ok (${Object.keys(now).length} files${exempt ? `, ${exempt} with a written size exception` : ''})` +
      (improved ? ` — ${improved} improved, run --update to lock it in` : ''),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
