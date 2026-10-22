#!/usr/bin/env node
/**
 * Move TypeScript files and rewrite every RELATIVE import that points at them — or that a moved file
 * makes — across one source root. `import … from`, `export … from`, `import()`, `require()` and
 * `jest.mock()` specifiers are rewritten; nothing else in a file is touched. Uses `git mv`.
 *
 *   node tools/move-ts.mjs <root> <plan.json>
 *   plan.json = [["old/relative/to/root.ts", "new/relative/to/root.ts"], …]
 *
 * Prints any other string that still names a moved file's old path (a test reading a file by name),
 * which has to be fixed by hand.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const [rootArg, planArg] = process.argv.slice(2);
const root = resolve(rootArg);
const plan = JSON.parse(readFileSync(planArg, 'utf8')).map(([a, b]) => [resolve(root, a), resolve(root, b)]);
const moved = new Map(plan);

const walk = (d) =>
  readdirSync(d).flatMap((e) => {
    const f = join(d, e);
    if (e === 'node_modules' || e === 'dist') return [];
    return statSync(f).isDirectory() ? walk(f) : /\.(ts|tsx|mts|cts)$/.test(e) ? [f] : [];
  });
const files = walk(root);

/** Resolve a relative specifier from `fromFile` to an existing file (or null). */
function target(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec);
  for (const c of [base, base + '.ts', base + '.tsx', join(base, 'index.ts')])
    if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}
function specFor(fromFile, toFile, original) {
  let r = relative(dirname(fromFile), toFile).replace(/\.tsx?$/, '');
  if (original.endsWith('/index') === false && r.endsWith('/index') && !original.includes('index')) r = r.slice(0, -6);
  if (!r.startsWith('.')) r = './' + r;
  return r;
}
const SPEC = /((?:from|import)\s*\(?\s*|require\(\s*|jest\.mock\(\s*)(['"])(\.{1,2}\/[^'"]+)\2/g;

// 1. Compute every file's new text against the CURRENT tree, as if it already lived at its new path.
const writes = new Map();
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  const newSelf = moved.get(f) ?? f;
  let changed = false;
  const out = text.replace(SPEC, (all, pre, q, spec) => {
    const t = target(f, spec);
    if (!t) return all;
    const newT = moved.get(t) ?? t;
    if (newT === t && newSelf === f) return all;
    const next = specFor(newSelf, newT, spec);
    if (next === spec) return all;
    changed = true;
    return `${pre}${q}${next}${q}`;
  });
  if (changed) writes.set(f, out);
}
// 2. Move, then write.
for (const [a, b] of plan) {
  mkdirSync(dirname(b), { recursive: true });
  execFileSync('git', ['mv', a, b]);
}
for (const [f, text] of writes) writeFileSync(moved.get(f) ?? f, text);
console.log(`moved ${plan.length} file(s); rewrote imports in ${writes.size}`);

// 3. Strings that still name an old path.
const names = plan.map(([a]) => relative(root, a).split('/').pop());
for (const f of walk(root)) {
  const t = readFileSync(f, 'utf8');
  for (const n of names) {
    const re = new RegExp(`['"\`][^'"\`]*\\b${n.replace(/\./g, '\\.')}['"\`]`);
    if (re.test(t) && !t.match(new RegExp(`from ['"][^'"]*${n.replace(/\.ts$/, '').replace(/\./g, '\\.')}['"]`))) {
      console.log(`  check by hand: ${relative(root, f)} names ${n}`);
    }
  }
}
