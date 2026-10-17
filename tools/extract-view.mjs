#!/usr/bin/env node
/**
 * After extract-hook: the values a component works out AFTER its early returns (`const isExternal = …`,
 * `const card = (<…/>)`) move into a plain function `<Name>View(…)` in its own file, called from the very
 * same place — so they are computed exactly when they were. MOVE ONLY. Sections can then take them as
 * props (extract-sections types them `ReturnType<typeof <Name>View>['x']`).
 *
 *   node tools/extract-view.mjs <file> <ComponentName> [--write]
 *
 * Taken: the statements after the LAST early return, before the final return. Refused when one of them
 * calls a hook, is not a declaration, or a `let` it declares is assigned later.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const [file, name, flag] = process.argv.slice(2);
const write = flag === '--write';
const src = readFileSync(file, 'utf8');
const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const fail = (w) => { console.error(`${file}: ${w}`); process.exit(1); };
const quote = /from "/.test(src) ? '"' : "'";
const semi = /from ['"][^'"]+['"];/.test(src) ? ';' : '';
const kebab = (n) => n.replace(/(?<!^)(?=[A-Z])/g, '-').toLowerCase();
const ids = (n) => { const o = new Set(); const w = (x) => { if (ts.isIdentifier(x)) o.add(x.text); x.forEachChild(w); }; w(n); return o; };
const bind = (b) => (ts.isIdentifier(b) ? [b.text] : b.elements.flatMap((e) => (ts.isOmittedExpression(e) ? [] : bind(e.name))));
const declaredBy = (st) => (ts.isVariableStatement(st) ? st.declarationList.declarations.flatMap((d) => bind(d.name)) : ts.isFunctionDeclaration(st) && st.name ? [st.name.text] : []);

const fn = sf.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === name);
if (!fn?.body) fail(`no function ${name}`);
const body = [...fn.body.statements];
const finalIdx = body.length - 1;
if (!ts.isReturnStatement(body[finalIdx])) fail('the component does not end with its return');
const isEarly = (st) => ts.isIfStatement(st) && (ts.isReturnStatement(st.thenStatement) || (ts.isBlock(st.thenStatement) && st.thenStatement.statements.some(ts.isReturnStatement)));
let last = -1;
body.forEach((st, i) => { if (i < finalIdx && isEarly(st)) last = i; });
const moved = body.slice(last + 1, finalIdx).filter((st) => !(ts.isVariableStatement(st) && /=\s*use[A-Z]\w*\(/.test(st.getText(sf)) && st === body[0]));
const startAt = moved.findIndex((st) => !(ts.isVariableStatement(st) && st.getText(sf).match(/=\s*(use\w+|vm|view|pageState|screenState)\b/)));
const take = startAt === -1 ? [] : moved.slice(startAt);
if (!take.length) fail('nothing is worked out after the early returns');
for (const st of take) {
  if (!(ts.isVariableStatement(st) || ts.isFunctionDeclaration(st))) fail(`not a declaration: ${st.getText(sf).slice(0, 60)}`);
  if (/\buse[A-Z]\w*\(/.test(st.getText(sf))) fail('a hook is called after an early return');
}
const declared = take.flatMap(declaredBy);
const restText = body.slice(finalIdx).map((s) => s.getText(sf)).join('\n') + body.slice(body.indexOf(take.at(-1)) + 1, finalIdx).map((s) => s.getText(sf)).join('\n');
const restIds = new Set([...ids(body[finalIdx]), ...body.slice(body.indexOf(take.at(-1)) + 1, finalIdx).flatMap((s) => [...ids(s)])]);
const returned = declared.filter((n) => restIds.has(n));
// What the moved code reads from the component's scope: params, the hook's names, earlier locals.
const scope = new Set([...fn.parameters.flatMap((p) => bind(p.name)), ...body.slice(0, body.indexOf(take[0])).flatMap(declaredBy)]);
const takeIds = new Set(take.flatMap((s) => [...ids(s)]));
const args = [...scope].filter((n) => takeIds.has(n) && !declared.includes(n));
// Module-level names of this file the moved code reads: only imports are allowed.
const imports = sf.statements.filter(ts.isImportDeclaration);
const importedNames = new Set(imports.flatMap((im) => { const c = im.importClause; if (!c) return []; const out = c.name ? [c.name.text] : []; const nb = c.namedBindings; if (nb && ts.isNamedImports(nb)) out.push(...nb.elements.map((e) => e.name.text)); if (nb && ts.isNamespaceImport(nb)) out.push(nb.name.text); return out; }));
const moduleNames = new Set(sf.statements.filter((s) => s !== fn && !ts.isImportDeclaration(s)).flatMap((s) => (s.name ? [s.name.text] : declaredBy(s))));
const bad = [...takeIds].filter((n) => moduleNames.has(n) && !importedNames.has(n));
if (bad.length) fail(`moved code reads module names of this file: ${bad.join(', ')}`);

const viewName = `${name}View`;
const target = join(dirname(file), `${kebab(name)}-view.tsx`);
if (existsSync(target)) fail(`${target} exists`);
// Types of the arguments: the component's own (params via Parameters<>, the rest via the hook's state type).
const hookStmt = body[0];
const hookCall = hookStmt.getText(sf).match(/=\s*(use\w+)\(/)?.[1];
const paramNames = new Set(fn.parameters.flatMap((p) => bind(p.name)));
const paramKey = new Map();
for (const p of fn.parameters) if (ts.isObjectBindingPattern(p.name)) for (const e of p.name.elements) if (ts.isIdentifier(e.name)) paramKey.set(e.name.text, [(e.propertyName ?? e.name).getText(sf), !!e.initializer]);
// A name an early return already ruled out (`if (!member) return …`) is known to be there.
const ruledOut = new Set();
for (const st of body.slice(0, last + 1)) if (isEarly(st)) {
  const w = (x) => { if (ts.isPrefixUnaryExpression(x) && x.operator === ts.SyntaxKind.ExclamationToken && ts.isIdentifier(x.operand)) ruledOut.add(x.operand.text); x.forEachChild(w); };
  w(st.expression);
}
const typeOf = (n) => ruledOut.has(n) ? `NonNullable<${typeOfRaw(n)}>` : typeOfRaw(n);
const typeOfRaw = (n) => {
  if (paramNames.has(n)) { const [k, d] = paramKey.get(n) ?? [n, false]; const t = `Parameters<typeof ${name}>[0]['${k}']`; return d ? `NonNullable<${t}>` : t; }
  return hookCall ? `ReturnType<typeof ${hookCall}>['${n}']` : 'never';
};
const hookImport = imports.find((im) => im.importClause?.namedBindings && ts.isNamedImports(im.importClause.namedBindings) && im.importClause.namedBindings.elements.some((e) => e.name.text === hookCall));
const notHook = args.filter((n) => !paramNames.has(n));
// An argument that is neither a prop nor from the hook (a local before the early returns) cannot be typed here.
const hookNames = new Set(ts.isVariableStatement(hookStmt) ? hookStmt.declarationList.declarations.flatMap((d) => bind(d.name)) : []);
const secondDestructure = body[1] && ts.isVariableStatement(body[1]) ? body[1].declarationList.declarations.flatMap((d) => bind(d.name)) : [];
for (const n of secondDestructure) hookNames.add(n);
const untyped = notHook.filter((n) => !hookNames.has(n));
if (untyped.length) fail(`reads locals declared before the early returns: ${untyped.join(', ')}`);

const rebase = (spec) => { if (!spec.startsWith('.')) return spec;
  if (resolve(dirname(file)) === resolve(dirname(target))) return spec; let r = relative(dirname(target), resolve(dirname(file), spec)).split('\\').join('/'); if (!r) r = '.'; return r.startsWith('.') ? r : './' + r; };
const lines = [];
for (const im of imports) {
  const c = im.importClause; if (!c) continue;
  const spec = rebase(im.moduleSpecifier.text);
  const nb = c.namedBindings;
  if (nb && ts.isNamespaceImport(nb)) { if (takeIds.has(nb.name.text)) lines.push(`import * as ${nb.name.text} from ${quote}${spec}${quote}${semi}`); continue; }
  const def = c.name && takeIds.has(c.name.text) ? c.name.text : null;
  const parts = nb && ts.isNamedImports(nb) ? nb.elements.filter((e) => takeIds.has(e.name.text)).map((e) => e.getText(sf)) : [];
  if (!def && !parts.length) continue;
  const head = [def, parts.length ? `{ ${parts.join(', ')} }` : null].filter(Boolean).join(', ');
  lines.push(`import ${c.isTypeOnly ? 'type ' : ''}${head} from ${quote}${spec}${quote}${semi}`);
}
if (hookImport) lines.push(`import type { ${hookCall} } from ${quote}${rebase(hookImport.moduleSpecifier.text)}${quote}${semi}`);
const isDefault = !!ts.getModifiers?.(fn)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
let cs = relative(dirname(target), file).replace(/\.tsx?$/, ''); if (!cs.startsWith('.')) cs = './' + cs;
if ([...args].some((n) => paramNames.has(n))) lines.push(isDefault ? `import type ${name} from ${quote}${cs}${quote}${semi}` : `import type { ${name} } from ${quote}${cs}${quote}${semi}`);
const ind = (src.slice(src.lastIndexOf('\n', take[0].getStart(sf)) + 1, take[0].getStart(sf)).match(/^\s*/) || ['  '])[0];
const movedText = src.slice(take[0].getFullStart(), take.at(-1).getEnd()).replace(/^\s*\n/, '');
const argType = `{ ${args.map((n) => `${n}: ${typeOf(n)}`).join('; ')} }`;
const list = (xs) => (xs.join(', ').length <= 80 ? `{ ${xs.join(', ')} }` : `{\n${xs.map((x) => `${ind}  ${x},`).join('\n')}\n${ind}}`);
const text = [
  `${quote}use client${quote}${semi}`, '', ...lines, '',
  `/** What ${name} works out after its early returns, moved here unchanged; called from the same place. */`,
  `export function ${viewName}(${args.length ? `${list(args)}: ${argType}` : ''}) {`,
  movedText, '',
  `${ind}return ${list(returned)}${semi}`, '}', '',
].join('\n');
const call = `const ${list(returned)} = ${viewName}(${args.length ? list(args) : ''})${semi}`;
let out = src.slice(0, take[0].getStart(sf)) + call + src.slice(take.at(-1).getEnd());
let spec = relative(dirname(file), target).replace(/\.tsx$/, ''); if (!spec.startsWith('.')) spec = './' + spec;
const lastImp = imports.at(-1);
const at = out.indexOf('\n', out.indexOf(lastImp.getText(sf)) + lastImp.getText(sf).length) + 1;
out = out.slice(0, at) + `import { ${viewName} } from ${quote}${spec}${quote}${semi}\n` + out.slice(at);
// The view's type names the component, so the component must be exported.
if (args.some((n) => paramNames.has(n)) && !ts.getModifiers?.(fn)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
  out = out.replace(new RegExp(`^(\\s*)((?:async\\s+)?function ${name}\\b)`, 'm'), '$1export $2');
}
console.log(`${target}: ${text.split('\n').length} lines (${returned.length} back); ${file}: ${out.split('\n').length} lines`);
if (write) { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, text); writeFileSync(file, out); }
