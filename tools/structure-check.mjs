#!/usr/bin/env node
/**
 * The structure ratchet (docs/plans/code-structure-fix.md, Phase 0): what is wrong today is
 * recorded in tools/structure-baseline.json and may only shrink; nothing NEW may be added.
 *
 *   node tools/structure-check.mjs           check (exit 1 on anything new)
 *   node tools/structure-check.mjs --update  lower the baseline to today (never raises it)
 *   node tools/structure-check.mjs --report  print today's counts and the worst offenders
 *
 * Four checks:
 *   names     file names that show a mechanical split (numbered, -part, -inner, repeated words,
 *             a "moved here unchanged" note) — see tools/structure/names.mjs
 *   cycles    import loops between our own files (value imports; `import type` is erased)
 *   boundary  server code (Nest, Prisma, Node built-ins …) reachable from @hbcfield/shared/client
 *   i18n      translation keys (en) that no source file reads, per app
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './structure/files.mjs';
import { measureNames, compareNames } from './structure/names.mjs';
import { cycles } from './structure/graph.mjs';
import { boundaryLeaks } from './structure/boundary.mjs';
import { unusedKeys } from './structure/i18n-unused.mjs';

const BASELINE = join(REPO, 'tools', 'structure-baseline.json');

function today() {
  return {
    names: measureNames(),
    cycles: cycles().map((c) => c.join(' ⇄ ')),
    boundary: boundaryLeaks().leaks,
    i18n: unusedKeys(),
  };
}

function problems(now, base) {
  const out = [];
  out.push(...compareNames(now.names, base.names ?? {}));
  const oldCycles = new Set(base.cycles ?? []);
  for (const c of now.cycles) if (!oldCycles.has(c)) out.push(`import loop: ${c}`);
  const oldLeaks = new Set(base.boundary ?? []);
  for (const l of now.boundary)
    if (!oldLeaks.has(l)) out.push(`server code reachable from @hbcfield/shared/client: ${l}`);
  for (const [app, keys] of Object.entries(now.i18n)) {
    const had = new Set(base.i18n?.[app] ?? []);
    const fresh = keys.filter((k) => !had.has(k));
    if (fresh.length)
      out.push(
        `${app} translation key(s) nobody reads — use them or delete them: ${fresh.slice(0, 20).join(', ')}${fresh.length > 20 ? ` … +${fresh.length - 20}` : ''}`,
      );
  }
  return out;
}

function lowered(now, base) {
  const names = {};
  for (const [f, found] of Object.entries(now.names))
    if (base.names?.[f]) names[f] = found.filter((x) => base.names[f].includes(x));
  const keep = (list, old) => list.filter((x) => (old ?? []).includes(x));
  const i18n = {};
  for (const [app, keys] of Object.entries(now.i18n)) i18n[app] = keep(keys, base.i18n?.[app]);
  return { names, cycles: keep(now.cycles, base.cycles), boundary: keep(now.boundary, base.boundary), i18n };
}

function counts(b) {
  const c = { names: 0, numbered: 0, part: 0, inner: 0, repeated: 0, moved: 0 };
  for (const found of Object.values(b.names)) {
    c.names++;
    for (const x of found) c[x]++;
  }
  return `${c.names} files with split names (numbered ${c.numbered}, part ${c.part}, inner ${c.inner}, repeated ${c.repeated}, moved-note ${c.moved}) · ${b.cycles.length} import loops · ${b.boundary.length} server imports reachable from shared/client · unused keys: ${Object.entries(
    b.i18n,
  )
    .map(([a, k]) => `${a} ${k.length}`)
    .join(', ')}`;
}

function save(b) {
  const sorted = {
    names: Object.fromEntries(
      Object.keys(b.names)
        .sort()
        .map((k) => [k, b.names[k]]),
    ),
    cycles: b.cycles,
    boundary: b.boundary,
    i18n: b.i18n,
  };
  writeFileSync(BASELINE, JSON.stringify(sorted, null, 1) + '\n');
}

function main() {
  const now = today();
  const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
  if (process.argv.includes('--report')) {
    console.log('today: ' + counts(now));
    if (base) console.log('baseline: ' + counts(base));
    for (const c of now.cycles) console.log('  loop: ' + c);
    for (const l of now.boundary) console.log('  leak: ' + l);
    return;
  }
  if (!base) {
    save(now);
    console.log('structure baseline written: ' + counts(now));
    return;
  }
  const bad = problems(now, base);
  if (process.argv.includes('--update')) {
    if (bad.length) {
      console.error('Refusing to raise the structure baseline:\n  ' + bad.join('\n  '));
      process.exit(1);
    }
    const next = lowered(now, base);
    save(next);
    console.log('structure baseline lowered: ' + counts(next));
    return;
  }
  if (bad.length) {
    console.error(
      'Structure ratchet — nothing new may be added to what tools/structure-baseline.json records:\n  ' +
        bad.join('\n  '),
    );
    process.exit(1);
  }
  const was = counts(base);
  const is = counts(lowered(now, base));
  console.log(`structure ratchet: ok — ${is}${was !== is ? ' (improved: run --update to lock it in)' : ''}`);
}

main();
