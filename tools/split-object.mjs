#!/usr/bin/env node
/**
 * Split one big exported object literal (an API client, a registry) into parts — MOVE ONLY.
 *
 *   node tools/split-object.mjs <file> <constName> <plan.json> [--write]
 *
 * plan.json: { "parts": [ { "name": "attendanceBreaksApi", "file": "attendance-breaks.ts",
 *                           "doc": "…", "from": "startBreak", "to": "breakSummary" }, … ] }
 * Each part takes the properties from `from` to `to` (inclusive, in file order) into its own file
 * as `export const <name> = { … }`; the source keeps the rest and becomes
 * `export const <constName> = { ...<part1>, ...<part2>, <the rest> }` — the same keys, the same
 * functions. Refused when a moved property uses `this` (a spread would change what it means).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const [file, constName, planPath, flag] = process.argv.slice(2);
const write = flag === '--write';
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const src = readFileSync(file, 'utf8');
const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const fail = (w) => { console.error(`${file}: ${w}`); process.exit(1); };
const quote = /from "/.test(src) ? '"' : "'";
const semi = /from ['"][^'"]+['"];/.test(src) ? ';' : '';
const ids = (n) => { const o = new Set(); const w = (x) => { if (ts.isIdentifier(x)) o.add(x.text); x.forEachChild(w); }; w(n); return o; };

const stmt = sf.statements.find((s) => ts.isVariableStatement(s) && s.declarationList.declarations.some((d) => d.name.getText(sf) === constName));
if (!stmt) fail(`no const ${constName}`);
const decl = stmt.declarationList.declarations.find((d) => d.name.getText(sf) === constName);
let obj = decl.initializer;
while (obj && (ts.isAsExpression(obj) || ts.isSatisfiesExpression?.(obj) || ts.isParenthesizedExpression(obj))) obj = obj.expression;
const isArray = obj && ts.isArrayLiteralExpression(obj);
if (!obj || (!ts.isObjectLiteralExpression(obj) && !isArray)) fail('not an object or array literal');
// An array is cut by its elements' `id` (a registry of `{ id: "…", … }` entries).
const props = isArray ? obj.elements : obj.properties;
const idOf = (e) => {
  if (!ts.isObjectLiteralExpression(e)) return null;
  const p = e.properties.find((x) => x.name?.getText(sf) === 'id' && ts.isPropertyAssignment(x));
  return p && ts.isStringLiteralLike(p.initializer) ? p.initializer.text : null;
};
const keyOf = (p) => (isArray ? idOf(p) : p.name ? p.name.getText(sf).replace(/^['"]|['"]$/g, '') : null);

// Module-level names of this file (other than imports): a moved property may not read them.
const local = new Set();
for (const s of sf.statements) {
  if (s === stmt || ts.isImportDeclaration(s)) continue;
  if (ts.isVariableStatement(s)) {
    for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name)) local.add(d.name.text);
  } else if (s.name) local.add(s.name.text);
}
const parts = [];
const taken = new Set();
for (const part of plan.parts) {
  const a = props.findIndex((p) => keyOf(p) === part.from);
  const b = props.findIndex((p) => keyOf(p) === part.to);
  if (a < 0 || b < a) fail(`part ${part.name}: ${part.from}…${part.to} not found in order`);
  const mine = props.slice(a, b + 1);
  for (const p of mine) {
    if (taken.has(p)) fail(`${keyOf(p)} is in two parts`);
    taken.add(p);
    let usesThis = false;
    const w = (x) => { if (x.kind === ts.SyntaxKind.ThisKeyword) usesThis = true; else if (!ts.isFunctionDeclaration(x) && !ts.isClassLike(x)) x.forEachChild(w); };
    w(p);
    if (usesThis) fail(`${keyOf(p)} uses this`);
    const bad = [...ids(p)].filter((n) => local.has(n));
    if (bad.length) fail(`${keyOf(p)} reads module names that stay: ${bad.join(', ')}`);
  }
  parts.push({ ...part, mine });
}

// Text of a run of properties, with their leading comments, as written.
const runText = (mine) => {
  const start = mine[0].getFullStart();
  let end = mine.at(-1).getEnd();
  const after = src.slice(end).match(/^\s*,/);
  if (after) end += after[0].length;
  return src.slice(start, end).replace(/^\s*\n/, '\n').replace(/,?\s*$/, ',');
};
const imports = sf.statements.filter(ts.isImportDeclaration);
const dir = dirname(file);
const out = [];
for (const part of parts) {
  const target = join(dir, part.file);
  if (existsSync(target)) fail(`${target} exists`);
  const used = new Set([...part.mine.flatMap((p) => [...ids(p)]), ...(isArray && decl.type ? ids(decl.type) : [])]);
  const lines = [];
  for (const im of imports) {
    const c = im.importClause;
    if (!c) continue;
    let spec = im.moduleSpecifier.text;
    if (spec.startsWith('.')) { spec = relative(dirname(target), resolve(dir, spec)).split('\\').join('/'); if (!spec.startsWith('.')) spec = './' + spec; }
    const nb = c.namedBindings;
    const def = c.name && used.has(c.name.text) ? c.name.text : null;
    const names = nb && ts.isNamedImports(nb) ? nb.elements.filter((e) => used.has(e.name.text)).map((e) => e.getText(sf)) : [];
    if (nb && ts.isNamespaceImport(nb) && used.has(nb.name.text)) { lines.push(`import * as ${nb.name.text} from ${quote}${spec}${quote}${semi}`); continue; }
    if (!def && !names.length) continue;
    const head = [def, names.length ? `{ ${names.join(', ')} }` : null].filter(Boolean).join(', ');
    let l = `import ${c.isTypeOnly ? 'type ' : ''}${head} from ${quote}${spec}${quote}${semi}`;
    if (l.length > 110 && names.length) l = `import ${c.isTypeOnly ? 'type ' : ''}${def ? def + ', ' : ''}{\n  ${names.join(',\n  ')},\n} from ${quote}${spec}${quote}${semi}`;
    lines.push(l);
  }
  const text = [...lines, '', `/** ${part.doc} Part of \`${constName}\`, moved here unchanged. */`, `export const ${part.name}${isArray && decl.type ? ': ' + decl.type.getText(sf) : ''} = ${isArray ? '[' : '{'}${runText(part.mine)}\n${isArray ? ']' : '}'}${semi}`, ''].join('\n');
  out.push([target, text]);
}
// The source: the moved runs cut, the parts spread in where the first of each stood.
let s = src;
const ranges = parts.map((p) => {
  const start = p.mine[0].getFullStart();
  let end = p.mine.at(-1).getEnd();
  const after = src.slice(end).match(/^\s*,/);
  if (after) end += after[0].length;
  return { start, end, name: p.name };
}).sort((a, b) => b.start - a.start);
const indent = (src.slice(src.lastIndexOf('\n', props[0].getStart(sf)) + 1, props[0].getStart(sf)).match(/^\s*/) || ['  '])[0];
for (const r of ranges) s = s.slice(0, r.start) + `\n${indent}...${r.name},` + s.slice(r.end);
const at = (() => { const last = imports.at(-1); return last ? s.indexOf('\n', s.indexOf(last.getText(sf)) + last.getText(sf).length) + 1 : 0; })();
s = s.slice(0, at) + out.map(([t], i) => { let spec = relative(dir, t).replace(/\.tsx?$/, ''); if (!spec.startsWith('.')) spec = './' + spec; return `import { ${parts[i].name} } from ${quote}${spec}${quote}${semi}\n`; }).join('') + s.slice(at);

console.log(`${file}: ${s.split('\n').length} lines; ${out.map(([t, b]) => `${t.split('/').pop()} ${b.split('\n').length}`).join(', ')}`);
if (write) { writeFileSync(file, s); for (const [t, b] of out) writeFileSync(t, b); }
