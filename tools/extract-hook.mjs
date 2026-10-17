#!/usr/bin/env node
/**
 * Move a React component's LOGIC — every statement before its first `return` — into a
 * `use<Name>` hook in its own file. MOVE ONLY: the same hooks run in the same order;
 * the component calls the hook first and reads back exactly the names its markup uses.
 *
 *   node tools/extract-hook.mjs <file> <ComponentName> [--write]
 *
 * Refused (nothing written) when:
 *   - the component is not a function declaration with at most one parameter;
 *   - the code that stays assigns to a `let` that moves (a returned copy would not see it);
 *   - the moved code reads a name declared after it in the component;
 *   - the moved code reads a module-level name of this file that the rest of the file
 *     also uses (the two files would import each other). One used ONLY by the moved code
 *     moves with it.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const argv = process.argv.slice(2);
const [file, name] = argv.filter((a, i) => !a.startsWith('--') && !['--as', '--cut'].includes(argv[i - 1]));
const write = argv.includes('--write');
// --half: cut a long function (a hook too) about halfway, at a statement boundary that the rules allow.
const half = argv.includes('--half');
const asName = argv.includes('--as') ? argv[argv.indexOf('--as') + 1] : null;
const src = readFileSync(file, 'utf8');
const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, kind);
const fail = (why) => { console.error(`${file}: ${why}`); process.exit(1); };

const ids = (n) => { const o = new Set(); const w = (x) => { if (ts.isIdentifier(x)) o.add(x.text); x.forEachChild(w); }; w(n); return o; };
const bindingNames = (b) => (ts.isIdentifier(b) ? [b.text] : b.elements.flatMap((e) => (ts.isOmittedExpression(e) ? [] : bindingNames(e.name))));
const declaredBy = (st) => {
  if (ts.isVariableStatement(st)) return st.declarationList.declarations.flatMap((d) => bindingNames(d.name));
  if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) return [st.name.text];
  return [];
};
const kebab = (n) => n.replace(/(?<!^)(?=[A-Z])/g, '-').toLowerCase();

// ── the component ──
const fn = sf.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === name);
if (!fn || !fn.body) fail(`no function declaration ${name}`);
// Several parameters are fine when each is a plain name: the hook takes the same list, the call passes the names.
const many = fn.parameters.length > 1;
if (many && fn.parameters.some((p) => !ts.isIdentifier(p.name))) fail('several parameters, one destructured');
const param = fn.parameters[0];
const body = fn.body.statements;

// The first statement that can return (a return not inside a nested function) ends the logic.
const returns = (n) => {
  let found = false;
  const w = (x) => {
    if (found) return;
    if (ts.isReturnStatement(x)) { found = true; return; }
    if (ts.isFunctionLike(x) || ts.isClassLike(x)) return;
    x.forEachChild(w);
  };
  w(n);
  return found;
};
let cut = body.findIndex(returns);
const fixedCut = argv.includes('--cut') ? Number(argv[argv.indexOf('--cut') + 1]) : null;
if (fixedCut != null) cut = fixedCut;
else if (half) {
  // Every statement boundary before the first return, nearest to half the lines first; the first
  // one the rules allow is taken (each is tried as `--cut k`).
  const limit = cut === -1 ? body.length : cut;
  const total = body.slice(0, limit).reduce((a, st) => a + st.getText(sf).split('\n').length, 0);
  let acc = 0;
  const cands = [];
  // The first part takes about half, never more than ~230 lines (its file also carries the imports).
  const goal = Math.min(total / 2, 230);
  for (let i = 0; i < limit - 1; i++) { acc += body[i].getText(sf).split('\n').length; cands.push([i + 1, Math.abs(acc - goal) + (acc > 250 ? 1000 : 0)]); }
  cands.sort((a, b) => a[1] - b[1]);
  const { execFileSync } = await import('node:child_process');
  const self = process.argv[1];
  const pass = argv.filter((a, i) => a !== '--half');
  for (const [k] of cands.slice(0, 40)) {
    try {
      const out = execFileSync('node', [self, ...pass, '--cut', String(k)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      process.stdout.write(out);
      process.exit(0);
    } catch { /* next boundary */ }
  }
  fail('no boundary the rules allow');
}
if (cut <= 0) fail('no logic before the first return');
const moved = body.slice(0, cut);
const rest = body.slice(cut);

const movedNames = moved.flatMap(declaredBy);
const restIds = new Set(rest.flatMap((s) => [...ids(s)]));
const movedIds = new Set(moved.flatMap((s) => [...ids(s)]));
const restNames = new Set(rest.flatMap(declaredBy));
const ahead = [...restNames].filter((n) => movedIds.has(n) && !movedNames.includes(n));
if (ahead.length) fail(`moved code reads names declared after it: ${ahead.join(', ')}`);

// A `let` that moves may not be assigned by what stays.
const lets = new Set(moved.filter((s) => ts.isVariableStatement(s) && s.declarationList.flags & ts.NodeFlags.Let).flatMap(declaredBy));
const assigned = [];
for (const s of rest) {
  const w = (x) => {
    if (ts.isBinaryExpression(x) && x.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && x.operatorToken.kind <= ts.SyntaxKind.LastAssignment && ts.isIdentifier(x.left) && lets.has(x.left.text)) assigned.push(x.left.text);
    if ((ts.isPrefixUnaryExpression(x) || ts.isPostfixUnaryExpression(x)) && ts.isIdentifier(x.operand) && lets.has(x.operand.text)) assigned.push(x.operand.text);
    x.forEachChild(w);
  };
  w(s);
}
if (assigned.length) fail(`the rest assigns moved lets: ${[...new Set(assigned)].join(', ')}`);

// What the component reads back.
const returned = movedNames.filter((n) => restIds.has(n));

// ── module-level names the moved code reads ──
const modStmts = sf.statements.filter((s) => s !== fn && !ts.isImportDeclaration(s));
const modByName = new Map(modStmts.flatMap((s) => declaredBy(s).map((n) => [n, s])).concat(
  modStmts.filter((s) => (ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s) || ts.isEnumDeclaration(s)) && s.name).map((s) => [s.name.text, s])));
const paramIds = new Set(fn.parameters.flatMap((p) => [...ids(p)]));
const needMod = new Set([...movedIds, ...paramIds].filter((n) => modByName.has(n)));
// Transitive: a moved module statement may read other module statements.
let grew = true;
while (grew) {
  grew = false;
  for (const n of [...needMod]) for (const m of ids(modByName.get(n))) if (modByName.has(m) && !needMod.has(m)) { needMod.add(m); grew = true; }
}
const modMove = new Set([...needMod].map((n) => modByName.get(n)));
// Module state (`let`) cannot move: an imported binding cannot be assigned, and the rest assigns it.
const modLets = [...modMove].filter((st) => ts.isVariableStatement(st) && st.declarationList.flags & ts.NodeFlags.Let);
if (modLets.length) fail(`the logic reads module state (let): ${modLets.flatMap(declaredBy).join(', ')}`);
// Module statements that stay (and the component) must not read what moves — else share it.
const stayingCode = [fn, ...modStmts.filter((s) => !modMove.has(s))];
const stayIds = new Set();
for (const s of stayingCode) {
  const w = (x) => {
    if (s === fn && moved.some((m) => x.pos >= m.pos && x.end <= m.end)) return; // inside the moved logic
    if (ts.isIdentifier(x)) stayIds.add(x.text);
    x.forEachChild(w);
  };
  w(s);
}
const shared = [...modMove].flatMap((s) => (s.name ? [s.name.text] : declaredBy(s))).filter((n) => stayIds.has(n));
// What both use moves with the logic and the source imports it back — one direction, no cycle
// (everything the moved code needs moved with it, so the hook file imports nothing from here).
if (modMove.has(fn)) fail('a module statement the logic needs reads the component itself');

// ── hook file ──
// A name the file already uses (an imported hook of the same name) is never taken: use<Name>Logic instead.
const takenNames = new Set([...src.matchAll(/\b[A-Za-z_$][\w$]*\b/g)].map((m) => m[0]));
const hookName = asName ?? (takenNames.has(`use${name}`) ? `use${name}Logic` : `use${name}`);
const hasJsx = (n) => { let j = false; const w = (x) => { if (j) return; if (ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x) || ts.isJsxFragment(x)) j = true; else x.forEachChild(w); }; w(n); return j; };
const ext = moved.some(hasJsx) || [...modMove].some(hasJsx) ? '.tsx' : '.ts';
const dir = file.includes('/apps/mobile/app/') || file.startsWith('apps/mobile/app/')
  ? join('apps/mobile/src/screens', dirname(file).replace(/^apps\/mobile\/app\/?/, '').replace(/[()]/g, ''))
  : dirname(file);
const hookFile = join(dir, `${kebab(hookName)}${ext}`);
if (existsSync(hookFile)) fail(`${hookFile} exists`);

const quote = /from "/.test(src) ? '"' : "'";
const semi = /from ['"][^'"]+['"];/.test(src) ? ';' : '';
const textOf = (n) => src.slice(n.getFullStart(), n.getEnd()).replace(/^\s*\n/, '');
const hookIds = new Set([...movedIds, ...paramIds, ...[...modMove].flatMap((s) => [...ids(s)])]);
const rebase = (spec) => {
  if (!spec.startsWith('.')) return spec;
  if (resolve(dirname(file)) === resolve(dir)) return spec;
  let r = relative(dir, resolve(dirname(file), spec)).split('\\').join('/');
  if (!r) r = '.';
  return r.startsWith('.') ? r : './' + r;
};
const importLines = [];
for (const im of sf.statements.filter(ts.isImportDeclaration)) {
  const c = im.importClause;
  if (!c) continue;
  const spec = rebase(im.moduleSpecifier.text);
  const nb = c.namedBindings;
  if (nb && ts.isNamespaceImport(nb)) { if (hookIds.has(nb.name.text)) importLines.push(`import ${c.isTypeOnly ? 'type ' : ''}* as ${nb.name.text} from ${quote}${spec}${quote}${semi}`); continue; }
  const def = c.name && hookIds.has(c.name.text) ? c.name.text : null;
  const parts = nb && ts.isNamedImports(nb) ? nb.elements.filter((e) => hookIds.has(e.name.text)).map((e) => e.getText(sf)) : [];
  if (!def && !parts.length) continue;
  const head = [def, parts.length ? `{ ${parts.join(', ')} }` : null].filter(Boolean).join(', ');
  let line = `import ${c.isTypeOnly ? 'type ' : ''}${head} from ${quote}${spec}${quote}${semi}`;
  if (line.length > 110 && parts.length) line = `import ${c.isTypeOnly ? 'type ' : ''}${def ? def + ', ' : ''}{\n  ${parts.join(',\n  ')},\n} from ${quote}${spec}${quote}${semi}`;
  importLines.push(line);
}
const directive = sf.statements.find((s) => ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression) && /^use client$/.test(s.expression.text));

// The hook's parameter: the component's own, as written (a destructured one keeps its pattern).
// The component passes only the names it destructured, so the hook's type is narrowed to them (Pick).
const paramText = (() => {
  if (!param) return '';
  if (many) return fn.parameters.map((p) => p.getText(sf)).join(', ');
  if (ts.isIdentifier(param.name) || !param.type || param.name.elements.some((e) => e.dotDotDotToken)) return param.getText(sf);
  const keys = param.name.elements.map((e) => `'${(e.propertyName ?? e.name).getText(sf)}'`);
  return `${param.name.getText(sf)}: Pick<${param.type.getText(sf)}, ${keys.join(' | ')}>`;
})();
const indentOf = (s) => (src.slice(src.lastIndexOf('\n', s.getStart(sf)) + 1, s.getStart(sf)).match(/^\s*/) || [''])[0];
const ind = moved.length ? indentOf(moved[0]) : '  ';
// The logic exactly as written, one slice of the source (statements keep their own line breaks).
const movedText = src.slice(moved[0].getFullStart(), moved.at(-1).getEnd()).replace(/^\s*\n/, '');
const ret = returned.length <= 6
  ? `${ind}return { ${returned.join(', ')} }${semi}`
  : `${ind}return {\n${returned.map((n) => `${ind}  ${n},`).join('\n')}\n${ind}}${semi}`;
const modText = [...modMove].sort((a, b) => a.pos - b.pos).map((s) => {
  let t = textOf(s);
  if (!ts.getModifiers?.(s)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
    t = t.replace(/^((?:\s*(?:\/\/.*|\/\*[\s\S]*?\*\/)\s*\n)*\s*)(?=(?:async\s+)?(?:function|const|let|class|type|interface|enum)\b)/, '$1export ');
  }
  return t.replace(/\n*$/, '\n');
});
const hookText = [
  ...(directive ? [`${quote}use client${quote}${semi}`, ''] : []),
  ...importLines,
  '',
  ...modText,
  `/** ${name}'s state and handlers — everything before its markup, moved here unchanged. */`,
  `export function ${hookName}(${paramText}) {`,
  movedText.replace(/\n*$/, ''),
  '',
  ret,
  '}',
  '',
].join('\n').replace(/\n{3,}/g, '\n\n');

// ── the component, rewritten ──
const call = `${ind}const ${returned.length <= 6 ? `{ ${returned.join(', ')} }` : `{\n${returned.map((n) => `${ind}  ${n},`).join('\n')}\n${ind}}`} = ${hookName}(${many ? fn.parameters.map((p) => p.name.getText(sf)).join(', ') : param ? paramArgs(param) : ''})${semi}\n`;
function paramArgs(p) {
  // A destructured parameter is rebuilt as an object of its own names — the hook destructures it the same way.
  if (ts.isIdentifier(p.name)) return p.name.text;
  const els = p.name.elements.filter((e) => !e.dotDotDotToken);
  const rest = p.name.elements.find((e) => e.dotDotDotToken);
  const parts = els.map((e) => {
    const key = e.propertyName ? e.propertyName.getText(sf) : e.name.getText(sf);
    const local = ts.isIdentifier(e.name) ? e.name.text : null;
    if (!local) fail('nested destructuring in the parameter');
    return key === local ? local : `${key}: ${local}`;
  });
  if (rest) parts.push(`...${rest.name.getText(sf)}`);
  return `{ ${parts.join(', ')} }`;
}
let out = src.slice(0, moved[0].getFullStart()) + '\n' + call + src.slice(moved.at(-1).getEnd());
// Module statements that moved leave the source; a shared type is imported back.
for (const s of [...modMove].sort((a, b) => b.pos - a.pos)) {
  const a = s.getFullStart(); const b = s.getEnd();
  const at = out.indexOf(src.slice(a, b));
  if (at !== -1) out = out.slice(0, at) + out.slice(at + (b - a));
}
let spec = relative(dirname(file), hookFile).replace(/\.tsx?$/, '').split('\\').join('/');
if (!spec.startsWith('.')) spec = './' + spec;
const isType = (n) => { const st = modByName.get(n); return ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st); };
// A module name this file EXPORTED keeps being exported from here (others import it from this path).
const exportedMoved = [...modMove].filter((st) => ts.getModifiers?.(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
  .flatMap((st) => (st.name ? [st.name.text] : declaredBy(st))).filter((n) => !shared.includes(n));
const back = [hookName, ...shared.map((t) => (isType(t) ? `type ${t}` : t))];
const reExport = [...shared, ...exportedMoved].filter((n) => {
  const st = modByName.get(n);
  return ts.getModifiers?.(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
});
const imp = back.join(', ').length > 90
  ? `import {\n  ${back.join(',\n  ')},\n} from ${quote}${spec}${quote}${semi}\n`
  : `import { ${back.join(', ')} } from ${quote}${spec}${quote}${semi}\n`;
const imps = sf.statements.filter(ts.isImportDeclaration);
const lastImp = imps.at(-1);
const insertAt = lastImp ? out.indexOf('\n', out.indexOf(lastImp.getText(sf)) + lastImp.getText(sf).length) + 1 : 0;
const reLine = reExport.length ? `export { ${reExport.map((t) => (isType(t) ? `type ${t}` : t)).join(', ')} } from ${quote}${spec}${quote}${semi}\n` : '';
out = (out.slice(0, insertAt) + imp + reLine + out.slice(insertAt)).replace(/\n{3,}/g, '\n\n');

console.log(`${hookFile}: ${hookText.split('\n').length} lines (${returned.length} names back); ${file}: ${out.split('\n').length} lines`);
if (write) { mkdirSync(dirname(hookFile), { recursive: true }), writeFileSync(hookFile, hookText); writeFileSync(file, out); }
