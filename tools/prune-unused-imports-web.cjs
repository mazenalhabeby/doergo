#!/usr/bin/env node
/**
 * Remove imports TypeScript reports as unused (TS6133 on a binding, TS6192 on a whole declaration).
 *
 *   npx tsc --noEmit -p tsconfig.json --noUnusedLocals --pretty false > report.txt
 *   node tools/prune-unused-imports-web.cjs report.txt <files…>
 *
 * Why it matters for speed, not only tidiness: webpack keeps an imported module in the route's
 * chunk even when no binding from it is used, because app source is not marked side-effect free.
 *
 * A declaration left with no bindings is deleted — EXCEPT for modules that run code on import
 * (SIDE_EFFECTS below), which keep a bare `import "x"` so their effect still happens.
 */
const fs = require('fs');
const path = require('path');
const ts = require(require.resolve('typescript', { paths: [process.cwd()] }));

const SIDE_EFFECTS = [/^@\/i18n(\/index)?$/, /leaflet/, /sentry/i, /polyfill/i, /\.css$/];
const [reportFile, ...files] = process.argv.slice(2);
const want = new Set(files.map((f) => path.resolve(f)));
const hits = new Map();
for (const m of fs.readFileSync(reportFile, 'utf8').matchAll(/^(.+?)\((\d+),(\d+)\): error TS(6133|6192)/gm)) {
  const f = path.resolve(m[1]);
  if (!want.has(f)) continue;
  if (!hits.has(f)) hits.set(f, []);
  hits.get(f).push({ line: +m[2] - 1, col: +m[3] - 1, code: m[4] });
}

let changed = 0;
for (const [file, list] of hits) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(
    file,
    src,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const at = (h) => sf.getPositionOfLineAndCharacter(h.line, h.col);
  const positions = list.map((h) => ({ pos: at(h), code: h.code }));
  const edits = [];
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause) continue;
    const spec = st.moduleSpecifier.text;
    const start = st.getStart(sf);
    const whole = positions.some((p) => p.code === '6192' && p.pos === start);
    const clause = st.importClause;
    const unused = (node) => positions.some((p) => p.code === '6133' && p.pos >= node.getStart(sf) && p.pos < node.end);
    // A single-binding declaration is reported by TS6133 at the declaration's start.
    const declUnused = positions.some((p) => p.code === '6133' && p.pos === start);
    let keepDefault = clause.name && !(whole || declUnused || unused(clause.name));
    let keepNamed = [];
    let keepNs = null;
    const nb = clause.namedBindings;
    if (nb && ts.isNamedImports(nb)) keepNamed = whole || declUnused ? [] : nb.elements.filter((e) => !unused(e));
    if (nb && ts.isNamespaceImport(nb)) keepNs = whole || declUnused || unused(nb) ? null : nb;
    const total =
      (clause.name ? 1 : 0) +
      (nb && ts.isNamedImports(nb) ? nb.elements.length : 0) +
      (nb && ts.isNamespaceImport(nb) ? 1 : 0);
    const kept = (keepDefault ? 1 : 0) + keepNamed.length + (keepNs ? 1 : 0);
    if (kept === total) continue;
    const quote = src[st.moduleSpecifier.getStart(sf)];
    const typeOnly = clause.isTypeOnly ? 'type ' : '';
    let text;
    if (kept === 0) {
      text = SIDE_EFFECTS.some((re) => re.test(spec)) && !clause.isTypeOnly ? `import ${quote}${spec}${quote}` : '';
    } else {
      const parts = [];
      if (keepDefault) parts.push(clause.name.text);
      if (keepNs) parts.push(keepNs.getText(sf));
      if (keepNamed.length) parts.push(`{ ${keepNamed.map((e) => e.getText(sf)).join(', ')} }`);
      text = `import ${typeOnly}${parts.join(', ')} from ${quote}${spec}${quote}`;
    }
    const semi = src.slice(start, st.end).trimEnd().endsWith(';') && text ? ';' : '';
    let end = st.end;
    if (!text && src[end] === '\n') end += 1;
    edits.push({ start, end, text: text ? text + semi : '' });
  }
  if (!edits.length) continue;
  let out = src;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  fs.writeFileSync(file, out);
  changed += 1;
}
console.log(`prune-unused-imports-web: ${changed} file(s) changed`);
