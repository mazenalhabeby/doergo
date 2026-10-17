#!/usr/bin/env node
/**
 * Copy-paste clones may only disappear.
 *
 *   node tools/dry-check.mjs            check (exit 1 if there are MORE clones than recorded)
 *   node tools/dry-check.mjs --update   lower the recorded count to today's (never raises it)
 *
 * Runs jscpd with tools/jscpd.json (≥ 12 lines and ≥ 80 tokens, TypeScript only; tests, locales,
 * migrations and build output excluded) over the source of every app and the shared package.
 * Needs the network once to fetch jscpd through npx.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BASELINE = path.join(ROOT, 'tools/dry-baseline.json');
const SOURCES = ['apps/api', 'apps/web-app/src', 'apps/mobile/src', 'apps/mobile/app', 'apps/admin', 'packages/shared/src'];

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'hbc-dry-'));
const config = { ...JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/jscpd.json'), 'utf8')), output: out };
const configFile = path.join(out, 'jscpd.json');
fs.writeFileSync(configFile, JSON.stringify(config));

const run = spawnSync('npx', ['--yes', 'jscpd@4.0.5', '--config', configFile, ...SOURCES], {
  cwd: ROOT,
  encoding: 'utf8',
});
const reportFile = path.join(out, 'jscpd-report.json');
if (!fs.existsSync(reportFile)) {
  console.error(`dry check: jscpd produced no report\n${run.stderr || run.stdout}`);
  process.exit(2);
}
const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
const clones = report.statistics.total.clones;
const list = report.duplicates
  .map((d) => `  ${d.lines} lines  ${d.firstFile.name}:${d.firstFile.start}  <->  ${d.secondFile.name}:${d.secondFile.start}`)
  .join('\n');
fs.rmSync(out, { recursive: true, force: true });

const recorded = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')).clones : null;
if (process.argv.includes('--update') || recorded === null) {
  if (recorded !== null && clones > recorded) {
    console.error(`dry check: refusing to update — ${clones} clones, ${recorded} recorded:\n${list}`);
    process.exit(1);
  }
  fs.writeFileSync(BASELINE, JSON.stringify({ clones }, null, 2) + '\n');
  console.log(`dry baseline: ${clones} clone(s)`);
  process.exit(0);
}
if (clones > recorded) {
  console.error(`dry check: ${clones} clones, ${recorded} recorded — extract the copy instead:\n${list}`);
  process.exit(1);
}
console.log(`dry check: ok — ${clones} clone(s)${clones < recorded ? `, ${recorded - clones} fewer than recorded` : ''}`);
