#!/usr/bin/env node
/**
 * Hand-written message patterns may only disappear.
 *
 *   node tools/rpc-ratchet.mjs            check (exit 1 if any file has MORE than its baseline)
 *   node tools/rpc-ratchet.mjs --update   lower the baseline to today's counts (never raises it)
 *
 * A pattern written as a string — `send({ cmd: 'x' }, …)` or `@MessagePattern({ cmd: 'x' })` —
 * carries no types: the payload is `any` at both ends. The typed way is a contract in
 * packages/shared/src/microservices/contracts (see contract.ts). Every file's count of
 * string patterns is recorded; it may shrink, never grow, and a new file must have none.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BASELINE = path.join(ROOT, 'tools/rpc-baseline.json');
const DIRS = ['apps/api'];
const PATTERN = /\{\s*cmd:\s*['"`]/g;

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '__tests__') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.ts$/.test(e.name) && !/\.(spec|test|d)\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

function counts() {
  const now = {};
  for (const d of DIRS) {
    for (const f of walk(path.join(ROOT, d), [])) {
      const n = (fs.readFileSync(f, 'utf8').match(PATTERN) ?? []).length;
      if (n) now[path.relative(ROOT, f)] = n;
    }
  }
  return now;
}

const now = counts();
const total = Object.values(now).reduce((a, b) => a + b, 0);
const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;

if (process.argv.includes('--update') || !baseline) {
  const next = {};
  for (const [f, n] of Object.entries(now))
    next[f] = baseline && baseline[f] !== undefined ? Math.min(n, baseline[f]) : n;
  const grew = baseline ? Object.keys(now).filter((f) => now[f] > (baseline[f] ?? 0)) : [];
  if (grew.length) {
    console.error(`rpc ratchet: refusing to update — more string patterns than recorded in:\n  ${grew.join('\n  ')}`);
    process.exit(1);
  }
  fs.writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n');
  console.log(`rpc baseline: ${total} string pattern(s) in ${Object.keys(next).length} file(s)`);
  process.exit(0);
}

const grew = Object.keys(now).filter((f) => now[f] > (baseline[f] ?? 0));
if (grew.length) {
  console.error('rpc ratchet — use a contract (packages/shared/src/microservices/contracts), not { cmd: "…" }:');
  for (const f of grew) console.error(`  ${f}: ${now[f]} (recorded ${baseline[f] ?? 0})`);
  process.exit(1);
}
const before = Object.values(baseline).reduce((a, b) => a + b, 0);
console.log(
  `rpc ratchet: ok — ${total} string pattern(s) left${total < before ? `, ${before - total} fewer than recorded` : ''}`,
);
