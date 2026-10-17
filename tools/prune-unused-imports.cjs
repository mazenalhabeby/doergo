#!/usr/bin/env node
/**
 * Remove the import bindings TypeScript reports as unused (TS6133 on a name, TS6192 on a whole
 * declaration) in the given files — default, named and namespace imports alike.
 *   tsc --noEmit -p tsconfig.json --noUnusedLocals --pretty false > report.txt
 *   node prune-unused-imports.cjs report.txt <files…>
 * A declaration whose bindings are ALL unused is removed only when its module is imported by
 * another file of the app too (so a module load — and any side effect — still happens).
 */
const fs = require('fs');
const path = require('path');
const ts = require(require.resolve('typescript', { paths: [process.cwd()] }));

const [reportFile, ...files] = process.argv.slice(2);
const report = fs.readFileSync(reportFile, 'utf8');
const want = new Set(files.map((f) => path.resolve(f)));
const hits = new Map(); // file → [{line, col, code}]
for (const m of report.matchAll(/^(.+?)\((\d+),(\d+)\): error TS(6133|6192|6198)/gm)) {
  const f = path.resolve(m[1]);
  if (!want.has(f)) continue;
  if (!hits.has(f)) hits.set(f, []);
  hits.get(f).push({ line: +m[2] - 1, col: +m[3] - 1, code: m[4] });
}

function importedElsewhere(spec, self) {
  // Cheap check: another source file in apps/mobile imports the same specifier text or resolves to the same file.
  const root = path.resolve('.');
  const target = spec.startsWith('.') ? path.resolve(path.dirname(self), spec) : spec;
  const stack = ['src', 'app'].map((d) => path.join(root, d));
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') stack.push(p); continue; }
      if (!/\.(tsx?|jsx?)$/.test(e.name) || p === self) continue;
      const txt = fs.readFileSync(p, 'utf8');
      for (const m of txt.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const t2 = m[1].startsWith('.') ? path.resolve(path.dirname(p), m[1]) : m[1];
        if (t2 === target) return true;
      }
    }
  }
  return false;
}

for (const [file, list] of hits) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const pos = (l) => sf.getPositionOfLineAndCharacter(l.line, l.col);
  const points = list.map((l) => ({ at: pos(l), code: l.code }));
  const edits = [];
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause) continue;
    const s0 = st.getStart(sf), s1 = st.end;
    const inDecl = points.filter((p) => p.at >= s0 && p.at < s1);
    if (!inDecl.length) continue;
    const whole = inDecl.some((p) => p.code === '6192' || p.code === '6198');
    const ic = st.importClause;
    const unused = (node) => whole || inDecl.some((p) => p.at === node.getStart(sf));
    let def = ic.name && !unused(ic.name) ? ic.name.text : null;
    let ns = null, named = [];
    if (ic.namedBindings && ts.isNamespaceImport(ic.namedBindings)) ns = unused(ic.namedBindings.name) ? null : ic.namedBindings.name.text;
    if (ic.namedBindings && ts.isNamedImports(ic.namedBindings)) named = ic.namedBindings.elements.filter((e) => !unused(e.name)).map((e) => e.getText(sf));
    const spec = st.moduleSpecifier.getText(sf);
    const specText = st.moduleSpecifier.text;
    if (!def && !ns && !named.length) {
      if (!importedElsewhere(specText, file)) { console.log(`${path.relative('.', file)}: kept ${spec} (imported nowhere else)`); continue; }
      let end = s1; if (src[end] === '\n') end++;
      edits.push({ s: s0, e: end, t: '' });
      continue;
    }
    const typeOnly = ic.isTypeOnly ? 'type ' : '';
    const parts = [];
    if (def) parts.push(def);
    if (ns) parts.push(`* as ${ns}`);
    if (named.length) parts.push(`{ ${named.join(', ')} }`);
    const semi = st.getText(sf).trimEnd().endsWith(';') ? ';' : '';
    let line = `import ${typeOnly}${parts.join(', ')} from ${spec}${semi}`;
    if (line.length > 120 && named.length) {
      const head = [def, ns && `* as ${ns}`].filter(Boolean).join(', ');
      line = `import ${typeOnly}${head ? head + ', ' : ''}{\n  ${named.join(',\n  ')},\n} from ${spec}${semi}`;
    }
    edits.push({ s: s0, e: s1, t: line });
  }
  let out = src;
  for (const ed of edits.sort((a, b) => b.s - a.s)) out = out.slice(0, ed.s) + ed.t + out.slice(ed.e);
  if (out !== src) { fs.writeFileSync(file, out); console.log(`${path.relative('.', file)}: ${edits.length} import(s) trimmed`); }
}
