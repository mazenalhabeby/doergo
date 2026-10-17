#!/usr/bin/env node
/**
 * Split one oversized React component, MOVE ONLY, in three steps:
 *   1. its logic → `use<Name>` (tools/extract-hook.mjs)
 *   2. the module-level helpers its markup reads → `<name>-helpers` (tools/extract-statements.mjs)
 *   3. large markup blocks → section components reading the hook's state (tools/extract-sections.mjs)
 *
 *   node tools/split-component.mjs <file> <ComponentName> [--write]
 *
 * Without --write it only reports what step 1 would do. Any step that refuses leaves the
 * files as the previous step left them; the caller checks with tsc and the tests.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const [file, name, flag] = process.argv.slice(2);
const write = flag === '--write';
const run = (tool, args) => {
  try {
    return { ok: true, out: execFileSync('node', [`tools/${tool}`, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() };
  } catch (e) {
    return { ok: false, out: String(e.stderr || e.message).trim().split('\n')[0] };
  }
};
const kebab = (n) => n.replace(/(?<!^)(?=[A-Z])/g, '-').toLowerCase();

// A hook (useX) is cut in halves instead: its data part becomes useXData.
if (/^use[A-Z]/.test(name)) {
  let ok = false;
  for (let i = 1; i <= 6; i++) {
    const r = run('extract-hook.mjs', [file, name, '--half', '--as', `${name}Data${i === 1 ? '' : i}`, ...(write ? ['--write'] : [])]);
    console.log('hook halves:', r.out);
    if (!r.ok || !write) { ok = ok || r.ok; break; }
    ok = true;
    if (readFileSync(file, 'utf8').split('\n').length <= 300) break;
  }
  process.exit(ok ? 0 : 1);
}
const h = run('extract-hook.mjs', [file, name, ...(write ? ['--write'] : [])]);
console.log('hook:', h.out);
if (!h.ok || !write) process.exit(h.ok ? 0 : 1);

// Step 2: module-level names the component (now markup + the hook call) still reads.
const src = readFileSync(file, 'utf8');
const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const fn = sf.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === name);
const declaredBy = (s) => {
  if (ts.isVariableStatement(s)) return s.declarationList.declarations.flatMap((d) => (ts.isIdentifier(d.name) ? [d.name.text] : []));
  return s.name && ts.isIdentifier(s.name) ? [s.name.text] : [];
};
const ids = (n) => { const o = new Set(); const w = (x) => { if (ts.isIdentifier(x)) o.add(x.text); x.forEachChild(w); }; w(n); return o; };
const byName = new Map();
for (const s of sf.statements) if (s !== fn && !ts.isImportDeclaration(s) && !ts.isExportDeclaration(s)) for (const n of declaredBy(s)) byName.set(n, s);
const need = new Set([...ids(fn)].filter((n) => byName.has(n)));
let grew = true;
while (grew) {
  grew = false;
  for (const n of [...need]) for (const m of ids(byName.get(n))) if (byName.has(m) && !need.has(m)) { need.add(m); grew = true; }
}
// Only plain helpers move: a default export or another component that uses the page stays.
const moving = [...need].filter((n) => {
  const st = byName.get(n);
  if (ts.getModifiers?.(st)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) return false;
  // module state (`let`) stays where it is assigned
  return !(ts.isVariableStatement(st) && st.declarationList.flags & ts.NodeFlags.Let);
});
if (moving.length) {
  const base = /(^|\/)apps\/mobile\/app\//.test(file)
    ? join('apps/mobile/src/screens', dirname(file).replace(/^.*apps\/mobile\/app\/?/, '').replace(/[()]/g, ''))
    : dirname(file);
  const helpersFile = join(base, `${kebab(name)}-helpers.tsx`);
  if (!existsSync(helpersFile)) {
    const r = run('extract-statements.mjs', [file, helpersFile, moving.join(','), `${name}'s module-level helpers, moved here unchanged so its sections can read them too.`, '--write']);
    console.log('helpers:', r.out);
  }
}
// Step 2b: values worked out after the early returns → <Name>View, so sections can take them.
const vw = run('extract-view.mjs', [file, name, '--write']);
console.log('view:', vw.out);
const sct = run('extract-sections.mjs', [file, name, '--write']);
console.log('sections:', sct.out);

// Step 4: a hook still over 300 lines is cut in two (`use<Name>Data` runs first, the rest reads it).
const lines = (f) => readFileSync(f, 'utf8').split('\n').length;
const hookFile = h.out.split(':')[0];
const hookName = `use${name}`;
// Repeated while it is still too long: …Data, …Data2, …Data3 (each runs before the next part).
for (let i = 1; i <= 6 && existsSync(hookFile) && lines(hookFile) > 300; i++) {
  const r = run('extract-hook.mjs', [hookFile, hookName, '--half', '--as', `${hookName}Data${i === 1 ? '' : i}`, '--write']);
  console.log('hook halves:', r.out);
  if (!r.ok) break;
}
