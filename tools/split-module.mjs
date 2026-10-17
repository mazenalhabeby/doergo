#!/usr/bin/env node
/**
 * Split one big module into several files — MOVE ONLY, no edits to the code.
 *
 *   node tools/split-module.mjs <plan.json> [--write]
 *
 * plan.json:
 *   { "source": "packages/shared/src/crm/business-card.ts",
 *     "outDir": "packages/shared/src/crm/card",
 *     "keepHeaderLines": 68,            // the file's doc comment, kept on the barrel
 *     "parts": [ { "name": "types", "from": 71, "doc": "…" }, … ],   // `from` = first line, in order
 *     "move": { "detectCardKind": "measure" } }                       // a name that belongs elsewhere
 *
 * Each top-level statement goes to the part its first line falls in (its leading
 * comments travel with it). For every part the tool computes which top-level
 * names it uses from other parts and from the source's own imports, adds those
 * imports, and exports what another part needs. The source becomes a barrel
 * that re-exports EXACTLY what it exported before — internal names stay
 * internal to the folder. A cycle between parts is refused (a `const` read at
 * load time across a cycle is undefined), so dependencies must run one way.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, basename } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const [planPath, flag] = process.argv.slice(2);
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const write = flag === '--write';
const src = readFileSync(plan.source, 'utf8');
const sf = ts.createSourceFile(plan.source, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
/** Where a statement really ends: a comment after it on the SAME line belongs to it, not to the next one. */
const lineEnd = (node) => {
  const rest = src.slice(
    node.getEnd(),
    src.indexOf('\n', node.getEnd()) === -1 ? src.length : src.indexOf('\n', node.getEnd()),
  );
  return /^\s*(\/\/.*|\/\*.*\*\/\s*)$/.test(rest) ? node.getEnd() + rest.length : node.getEnd();
};
/** A statement's text with its leading comments, minus a same-line comment that belongs to the one before. */
const fullText = (node) => {
  let start = node.getFullStart();
  const prevLineEnd = src.lastIndexOf('\n', start - 1);
  const head = src.slice(start, src.indexOf('\n', start) === -1 ? src.length : src.indexOf('\n', start));
  if (start > 0 && src[start - 1] !== '\n' && /^\s*(\/\/.*|\/\*.*\*\/\s*)$/.test(head)) start += head.length;
  void prevLineEnd;
  return src.slice(start, lineEnd(node));
};

const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;

// ── top-level statements → names declared, names used ──
const imports = []; // { names: [{local, imported, isType}], spec, text }
const stmts = [];
const reexports = []; // `export … from` / `export { … }` — they stay on the barrel, in order
for (const st of sf.statements) {
  if (ts.isExportDeclaration(st)) {
    // `export { X }` of an IMPORTED name: the import leaves with the code, so the barrel says where X comes from.
    const els = !st.moduleSpecifier && st.exportClause && ts.isNamedExports(st.exportClause) ? st.exportClause.elements : null;
    const from = els && els.map((el) => imports.find((i) => i.names.some((n) => n.local === (el.propertyName ?? el.name).text))?.spec);
    if (from && from.every((f) => f && f === from[0])) {
      reexports.push(fullText(st).replace(/^\s*\n/, '').replace(/\}\s*(;?)\s*$/, (_, sc) => `} from '${from[0]}'${sc}`));
      continue;
    }
    reexports.push(fullText(st).replace(/^\s*\n/, ''));
    continue;
  }
  if (ts.isImportDeclaration(st)) {
    const spec = st.moduleSpecifier.text;
    const names = [];
    const nb = st.importClause?.namedBindings;
    if (nb && ts.isNamedImports(nb))
      for (const el of nb.elements) {
        names.push({
          local: el.name.text,
          imported: el.propertyName?.text ?? el.name.text,
          isType: !!(st.importClause.isTypeOnly || el.isTypeOnly),
        });
      }
    if (st.importClause?.name) names.push({ local: st.importClause.name.text, imported: 'default', isType: false });
    imports.push({ spec, names });
    continue;
  }
  const declared = [];
  const exported = !!st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) declared.push(d.name.getText(sf));
  else if (st.name) declared.push(st.name.text);
  const isTypeOnly = ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st);
  const used = new Set();
  const visit = (n) => {
    if (ts.isIdentifier(n)) {
      const p = n.parent;
      const isPropName =
        p &&
        ((ts.isPropertyAccessExpression(p) && p.name === n) ||
          (ts.isPropertyAssignment(p) && p.name === n) ||
          (ts.isPropertySignature(p) && p.name === n) ||
          (ts.isMethodDeclaration(p) && p.name === n) ||
          (ts.isPropertyDeclaration(p) && p.name === n) ||
          (ts.isQualifiedName(p) && p.right === n));
      if (!isPropName) used.add(n.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(st);
  stmts.push({ st, declared, exported, isTypeOnly, used, start: lineOf(st.getStart(sf)), text: fullText(st) });
}

// ── assign to parts ──
const parts = plan.parts.map((p, i) => ({ ...p, idx: i, stmts: [] }));
for (const s of stmts) {
  let part = parts[0];
  for (const p of parts) if (s.start >= p.from) part = p;
  const moved = s.declared.map((n) => plan.move?.[n]).find(Boolean);
  if (moved)
    part =
      parts.find((p) => p.name === moved) ??
      (() => {
        throw new Error('no part ' + moved);
      })();
  if (s.start < parts[0].from) throw new Error(`statement at line ${s.start} is before the first part`);
  part.stmts.push(s);
}
const owner = new Map(); // name → { part, exported, isTypeOnly }
for (const p of parts)
  for (const s of p.stmts)
    for (const n of s.declared) owner.set(n, { part: p, exported: s.exported, isTypeOnly: s.isTypeOnly });
const importOf = new Map();
for (const im of imports) for (const n of im.names) importOf.set(n.local, { ...n, spec: im.spec });

// ── per part: what it needs ──
const needsExport = new Set();
const deps = new Map(parts.map((p) => [p.idx, new Set()]));
for (const p of parts) {
  p.local = new Map();
  p.ext = new Map();
  const own = new Set(p.stmts.flatMap((s) => s.declared));
  for (const s of p.stmts)
    for (const u of s.used) {
      if (own.has(u)) continue;
      const o = owner.get(u);
      if (o) {
        const valueUse = !o.isTypeOnly;
        const prev = p.local.get(u);
        p.local.set(u, { part: o.part, type: o.isTypeOnly && (prev?.type ?? true) });
        needsExport.add(u);
        deps.get(p.idx).add(o.part.idx);
        if (valueUse) void 0;
        continue;
      }
      const im = importOf.get(u);
      if (im) p.ext.set(u, im);
    }
}

// cycle check
const visiting = new Set();
const done = new Set();
const dfs = (i, path) => {
  if (done.has(i)) return;
  if (visiting.has(i)) {
    const chain = [...path, i];
    const why = chain.slice(0, -1).map((k, j) => {
      const to = parts[chain[j + 1]];
      const names = [...parts[k].local].filter(([, l]) => l.part === to).map(([n]) => n);
      return `${parts[k].name} → ${to.name} (${names.join(', ')})`;
    });
    throw new Error('cycle between parts:\n  ' + why.join('\n  '));
  }
  visiting.add(i);
  for (const d of deps.get(i)) dfs(d, [...path, i]);
  visiting.delete(i);
  done.add(i);
};
for (const p of parts) dfs(p.idx, []);

// ── write ──
const relSpec = (fromFile, spec) => {
  if (!spec.startsWith('.')) return spec;
  const target = join(dirname(plan.source), spec);
  let r = relative(dirname(fromFile), target);
  if (!r.startsWith('.')) r = './' + r;
  return r;
};
/** `import { a, b } from 'x'` — all-type lists as `import type`, wrapped past 120 characters. */
const named = (kw, names, from) => {
  const allTypes = names.every((n) => n.startsWith('type '));
  const list = allTypes ? names.map((n) => n.slice(5)) : names;
  const head = allTypes ? `${kw} type` : kw;
  const one = `${head} { ${list.join(', ')} } from '${from}';`;
  return one.length <= 120 ? one : `${head} {\n  ${list.join(',\n  ')},\n} from '${from}';`;
};
const out = [];
for (const p of parts) {
  const file = join(plan.outDir, p.name + '.ts');
  const lines = [];
  if (p.doc) {
    // One line when it fits; else wrapped at ~100 characters, so a part's doc never trips the 140 ratchet.
    if (p.doc.length <= 110) lines.push('/** ' + p.doc + ' */');
    else {
      const wrapped = [''];
      for (const w of p.doc.split(' ')) {
        if ((wrapped.at(-1) + ' ' + w).trim().length > 96) wrapped.push(w);
        else wrapped[wrapped.length - 1] = (wrapped.at(-1) + ' ' + w).trim();
      }
      lines.push('/**', ...wrapped.map((l) => ' * ' + l), ' */');
    }
  }
  const byExt = new Map();
  for (const [local, im] of p.ext) {
    const key = im.spec;
    if (!byExt.has(key)) byExt.set(key, []);
    byExt.get(key).push(im);
  }
  for (const [spec, ims] of byExt) {
    const names = ims.map(
      (im) => (im.isType ? 'type ' : '') + (im.imported === im.local ? im.local : `${im.imported} as ${im.local}`),
    );
    lines.push(named('import', names.sort(), relSpec(file, spec)));
  }
  const byPart = new Map();
  for (const [name, l] of p.local) {
    if (!byPart.has(l.part.name)) byPart.set(l.part.name, []);
    byPart.get(l.part.name).push((l.type ? 'type ' : '') + name);
  }
  for (const [name, names] of [...byPart].sort()) lines.push(named('import', names.sort(), `./${name}`));
  // Moved lines stay byte-for-byte: what another part needs is exported in one list at the bottom.
  const body = p.stmts.map((s) => s.text.replace(/^\s*\n/, '')).join('\n\n');
  // Values and types are exported in separate lists (isolatedModules refuses a type in a value export).
  const unexported = p.stmts.filter((s) => !s.exported);
  const sharedValues = unexported.filter((s) => !s.isTypeOnly).flatMap((s) => s.declared.filter((n) => needsExport.has(n)));
  const sharedTypes = unexported.filter((s) => s.isTypeOnly).flatMap((s) => s.declared.filter((n) => needsExport.has(n)));
  const tail = [
    sharedValues.length ? named('export', sharedValues, '').replace(/ from '';$/, ';') : '',
    sharedTypes.length ? named('export', sharedTypes.map((n) => 'type ' + n), '').replace(/ from '';$/, ';') : '',
  ].filter(Boolean).map((l) => '\n\n' + l).join('');
  const text = (lines.length ? lines.join('\n') + '\n\n' : '') + body.trimStart() + tail + '\n';
  out.push({ file, text });
}
const publicNames = stmts
  .filter((s) => s.exported)
  .flatMap((s) => s.declared.map((n) => ({ n, part: owner.get(n).part, type: s.isTypeOnly })));
// The kept header is the doc comment; the source's own import lines in it moved with the code that uses them.
let header = src.split('\n').slice(0, plan.keepHeaderLines).join('\n');
for (const st of [...sf.statements].reverse())
  if (ts.isImportDeclaration(st) && st.getEnd() <= header.length) header = header.slice(0, st.getStart(sf)) + header.slice(st.getEnd()).replace(/^\n/, '');
header = header.replace(/^\s*\n/, '');
// A header that stops one line short of its `*/` would leave the comment open over the whole barrel.
if (/\/\*(?![\s\S]*\*\/)/.test(header)) header += '\n */';
const byPart = new Map();
for (const x of publicNames) {
  if (!byPart.has(x.part.name)) byPart.set(x.part.name, []);
  byPart.get(x.part.name).push((x.type ? 'type ' : '') + x.n);
}
const folder = relative(dirname(plan.source), plan.outDir);
const barrel =
  header +
  '\n' +
  (reexports.length ? reexports.join('\n') + '\n\n' : '') +
  [...byPart].map(([name, names]) => named('export', names, `./${folder}/${name}`)).join('\n') +
  '\n';

// Inline type imports (`import('./enums').X`) are paths too — re-point them from the new file.
for (const o of out) {
  if (o.file === plan.source) continue;
  o.text = o.text.replace(/import\((['"])(\.[^'"]+)\1\)/g, (m, q, spec) => `import(${q}${relSpec(o.file, spec)}${q})`);
}
for (const o of out) console.log(`${o.file}: ${o.text.split('\n').length} lines`);
console.log(`${plan.source} (barrel): ${barrel.split('\n').length} lines; ${publicNames.length} public names`);
if (write) {
  mkdirSync(plan.outDir, { recursive: true });
  for (const o of out) writeFileSync(o.file, o.text);
  writeFileSync(plan.source, barrel);
}
