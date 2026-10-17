#!/usr/bin/env node
/**
 * Prettier on the files YOU changed — never the whole repo (a full reformat
 * would bury every real diff for months). Width 120; each app keeps its own
 * quote/semicolon style (root .prettierrc.json, apps/web-app/.prettierrc.json).
 *
 *   pnpm format:changed <files…>       just those files
 *   pnpm format:changed --all          the working tree + untracked files (a big tree = a big reformat)
 *   pnpm format:changed --since main   everything changed since `main`
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// ⚠️ 2026-10-17: run with no argument on a large uncommitted tree it reformatted ~800 files at once
// (one-word-per-line lists, JSX props one per line) and the old layout had to be rebuilt from git.
// Now it formats the FILES NAMED, or everything changed with an explicit --all / --since <ref>.
const argv = process.argv.slice(2);
const named = argv.filter((a) => !a.startsWith('--') && existsSync(a));
const base = argv.includes('--since') ? argv[argv.indexOf('--since') + 1] : undefined;
if (!named.length && !base && !argv.includes('--all')) {
  console.error('format:changed — name the files to format, or pass --all (working tree) / --since <ref>');
  process.exit(1);
}
const run = (cmd) =>
  execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter(Boolean);
const files = named.length ? named : [
  ...new Set([
    ...run(
      base ? `git diff --name-only --diff-filter=ACMR ${base}...HEAD` : 'git diff --name-only --diff-filter=ACMR HEAD',
    ),
    ...run('git ls-files --others --exclude-standard'),
  ]),
].filter((f) => /\.(tsx?|mjs|js)$/.test(f) && existsSync(f));

if (!files.length) {
  console.log('format:changed — nothing changed');
  process.exit(0);
}
execSync(`npx prettier --write --log-level warn ${files.map((f) => JSON.stringify(f)).join(' ')}`, {
  stdio: 'inherit',
});
console.log(`format:changed — ${files.length} file(s)`);
