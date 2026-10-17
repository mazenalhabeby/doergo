#!/usr/bin/env node
/**
 * After extract-hook: move large blocks of a component's markup into section components
 * that take the hook's state. MOVE ONLY — the same elements, the same props, the same order.
 *
 *   node tools/extract-sections.mjs <file> <ComponentName> [--max 260] [--write]
 *
 * The component must start with `const { … } = use<Name>(…)` (what extract-hook writes).
 * That call becomes `const s = use<Name>(…)` + the same destructure, and a block becomes
 * `<XSection s={s} />`. A section file is
 *     export function XSection({ s }: { s: <Name>State }) { const { a, b } = s; return (<block/>) }
 * A block is taken only when every local name it reads comes from the hook (a `.map`
 * variable or a local declared after the hook keeps the block where it is) and every
 * module-level name it reads is an import. Largest blocks first, until the component
 * fits --max lines.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const args = process.argv.slice(2);
const write = args.includes('--write');
const max = args.includes('--max') ? Number(args[args.indexOf('--max') + 1]) : 260;
const [file, name] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--max');
let src = readFileSync(file, 'utf8');
const fail = (why) => { console.error(`${file}: ${why}`); process.exit(1); };
const parse = (text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const quote = /from "/.test(src) ? '"' : "'";
const semi = /from ['"][^'"]+['"];/.test(src) ? ';' : '';
const kebab = (n) => n.replace(/(?<!^)(?=[A-Z])/g, '-').toLowerCase();
const lineOf = (sf, p) => sf.getLineAndCharacterOfPosition(p).line + 1;

const sf0 = parse(src);
const fn0 = sf0.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === name);
if (!fn0?.body) fail(`no function ${name}`);
// The hook the component starts with: use<Name>, or use<Name>Logic when that name was taken.
const hookName = (() => { const st = fn0.body.statements[0]; const t = st?.getText(sf0) ?? ''; const m = t.match(/=\s*(use\w+)\(/); return m ? m[1] : `use${name}`; })();
// Either `const { … } = useX(…)` or, after an earlier run, `const vm = useX(…)` + `const { … } = vm`.
let first = fn0.body.statements[0];
let decl = first && ts.isVariableStatement(first) ? first.declarationList.declarations[0] : null;
if (decl && ts.isIdentifier(decl.name) && decl.initializer && ts.isCallExpression(decl.initializer)) {
  const second = fn0.body.statements[1];
  const d2 = second && ts.isVariableStatement(second) ? second.declarationList.declarations[0] : null;
  if (d2 && ts.isObjectBindingPattern(d2.name) && d2.initializer?.getText(sf0) === decl.name.text) {
    decl = { ...d2, initializer: decl.initializer, name: d2.name };
  }
}
if (!decl || !decl.initializer || !ts.isCallExpression(decl.initializer) || decl.initializer.expression.getText(sf0) !== hookName || !ts.isObjectBindingPattern(decl.name))
  fail(`the component does not start with const { … } = ${hookName}(…)`);
const fromHook = new Set(decl.name.elements.map((e) => e.name.getText(sf0)));
// The component's own props a block reads travel as props of the section, typed from the component.
const bindNames = (b) => (ts.isIdentifier(b) ? [b.text] : b.elements.flatMap((e) => (ts.isOmittedExpression(e) ? [] : bindNames(e.name))));
const paramNames = new Set(fn0.parameters.flatMap((p) => bindNames(p.name)));
const paramKey = new Map();
const paramDefaulted = new Set();
for (const p of fn0.parameters) if (ts.isObjectBindingPattern(p.name)) for (const e of p.name.elements) if (ts.isIdentifier(e.name)) {
  paramKey.set(e.name.text, (e.propertyName ?? e.name).getText(sf0));
  if (e.initializer) paramDefaulted.add(e.name.text); // a default makes it defined inside the component
}
const isDefaultExport = !!ts.getModifiers?.(fn0)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
// Values worked out after the early returns, by `<Name>View(…)` (tools/extract-view.mjs): passable too.
const viewName = `${name}View`;
const viewStmt = fn0.body.statements.find((st) => ts.isVariableStatement(st) && st.declarationList.declarations.some((d) => d.initializer && ts.isCallExpression(d.initializer) && d.initializer.expression.getText(sf0) === viewName));
const viewNames = new Set(viewStmt ? viewStmt.declarationList.declarations.flatMap((d) => bindNames(d.name)) : []);
const viewImport = sf0.statements.find((st) => ts.isImportDeclaration(st) && st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings) && st.importClause.namedBindings.elements.some((e) => e.name.text === viewName));
const hookImport = sf0.statements.find((s) => ts.isImportDeclaration(s) && s.importClause?.namedBindings && ts.isNamedImports(s.importClause.namedBindings) && s.importClause.namedBindings.elements.some((e) => e.name.text === hookName));
const hookSpec = hookImport.moduleSpecifier.text;
const stateType = `${name}State`;
// The prop that carries the state: a name this file (and the hook) does not already use.
const taken = new Set([...src.matchAll(/\b[A-Za-z_$][\w$]*\b/g)].map((m) => m[0]));
const P = ['vm', 'view', 'pageState', 'screenState'].find((n) => !taken.has(n) || new RegExp(`\\bconst ${n} = ${hookName}\\(`).test(src));

// `const s = useX(…)` then the same destructure from `s` — once.
if (!new RegExp(`\\bconst ${P} = use`).test(fn0.body.getText(sf0))) {
  const call = decl.initializer.getText(sf0);
  const pattern = decl.name.getText(sf0);
  const ind = (src.slice(src.lastIndexOf('\n', first.getStart(sf0)) + 1, first.getStart(sf0)).match(/^\s*/) || [''])[0];
  src = src.slice(0, first.getStart(sf0)) + `const ${P} = ${call}${semi}\n${ind}const ${pattern} = ${P}${semi}` + src.slice(first.getEnd());
}

const freeIds = (node) => {
  // Identifiers read in the node, minus those it declares itself (params, locals, map variables).
  const declared = new Set();
  const used = new Set();
  const w = (x) => {
    if ((ts.isParameter(x) || ts.isVariableDeclaration(x) || ts.isBindingElement(x)) && x.name) {
      const names = (b) => (ts.isIdentifier(b) ? [b.text] : b.elements.flatMap((e) => (ts.isOmittedExpression(e) ? [] : names(e.name))));
      for (const n of names(x.name)) declared.add(n);
    }
    if (ts.isIdentifier(x)) {
      const p = x.parent;
      // <div>, </span>: an intrinsic tag is not a name.
      if ((ts.isJsxOpeningElement(p) || ts.isJsxClosingElement(p) || ts.isJsxSelfClosingElement(p)) && p.tagName === x && /^[a-z]/.test(x.text)) { x.forEachChild(w); return; }
      const isProp = (ts.isPropertyAccessExpression(p) && p.name === x) || (ts.isPropertyAssignment(p) && p.name === x) || ts.isJsxAttribute(p) || (ts.isQualifiedName(p) && p.right === x)
        // a key in a type (`{ title: string }`) or the source side of `{ name: alias }` is not a read
        || ((ts.isPropertySignature(p) || ts.isMethodSignature(p)) && p.name === x)
        || (ts.isBindingElement(p) && p.propertyName === x);
      if (!isProp) used.add(x.text);
    }
    x.forEachChild(w);
  };
  w(node);
  return [...used].filter((n) => !declared.has(n));
};

const sections = [];
for (let round = 0; round < 12; round++) {
  const sf = parse(src);
  const fn = sf.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === name);
  const size = lineOf(sf, fn.getEnd()) - lineOf(sf, fn.getStart(sf)) + 1;
  // Stop when the FILE fits (imports and props count too), not just the function.
  if (src.split('\n').length <= Math.min(max + 30, 290)) break;
  const ret = [...fn.body.statements].reverse().find(ts.isReturnStatement);
  if (!ret?.expression) fail('no final return');
  // Module-level names: imports are fine; anything declared in this file is not.
  const imported = new Set();
  const moduleDeclared = new Set();
  for (const s of sf.statements) {
    if (ts.isImportDeclaration(s)) {
      const c = s.importClause;
      if (c?.name) imported.add(c.name.text);
      const nb = c?.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) imported.add(nb.name.text);
      if (nb && ts.isNamedImports(nb)) for (const e of nb.elements) imported.add(e.name.text);
    } else if (s !== fn) {
      if (s.name) moduleDeclared.add(s.name.text);
      if (ts.isVariableStatement(s)) for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name)) moduleDeclared.add(d.name.text);
    }
  }
  const GLOBALS = new Set(['undefined', 'null', 'true', 'false', 'Math', 'Date', 'Number', 'String', 'Boolean', 'Object', 'Array', 'JSON', 'console', 'window', 'document', 'Intl', 'Promise', 'Set', 'Map', 'encodeURIComponent', 'parseInt', 'parseFloat', 'isNaN', 'React', 'navigator', 'setTimeout', 'clearTimeout', 'Infinity', 'NaN', 'Error', 'RegExp', 'Symbol', 'globalThis', 'Record', 'Partial', 'const', 'typeof', 'keyof']);
  const okBlock = (el) => {
    const free = freeIds(el);
    const bad = free.filter((n) => !fromHook.has(n) && !paramNames.has(n) && !viewNames.has(n) && !imported.has(n) && !GLOBALS.has(n) && n !== P);
    if (bad.length && process.env.DEBUG) console.error('block', lineOf(sf, el.getStart(sf)), 'reads', bad.join(', '));
    return bad.length ? null : free;
  };
  // Candidates: JSX elements inside the return, 30+ lines, not the root, largest first that fit.
  const cands = [];
  const w = (x) => {
    if ((ts.isJsxElement(x) || ts.isJsxFragment(x)) && x !== ret.expression && !(ts.isParenthesizedExpression(ret.expression) && x === ret.expression.expression)) {
      const lines = lineOf(sf, x.getEnd()) - lineOf(sf, x.getStart(sf)) + 1;
      if (lines >= 20 && lines <= 250) cands.push({ x, lines });
    }
    // `{(() => { const a = …; return (<…/>) })()}` — an inline function in the markup moves whole.
    if (ts.isJsxExpression(x) && x.expression && ts.isCallExpression(x.expression) && !x.expression.arguments.length) {
      let callee = x.expression.expression;
      while (ts.isParenthesizedExpression(callee)) callee = callee.expression;
      if (ts.isArrowFunction(callee) || ts.isFunctionExpression(callee)) {
        const lines = lineOf(sf, x.getEnd()) - lineOf(sf, x.getStart(sf)) + 1;
        if (lines >= 20 && lines <= 250) cands.push({ x: x.expression, lines, iife: x });
      }
    }
    x.forEachChild(w);
  };
  w(ret.expression);
  cands.sort((a, b) => b.lines - a.lines);
  if (process.env.DEBUG) console.error('candidates', cands.length, 'component lines', size);
  // A block shown under a condition (`{a && (<X/>)}`, `{a ? <X/> : <Y/>}`) moves WITH the condition —
  // inside its own component the narrowing (`a` is not null) would otherwise be lost.
  const unitOf = (x) => {
    let u = x;
    for (let p = u.parent; p; u = p, p = p.parent) {
      if (ts.isParenthesizedExpression(p)) continue;
      if (ts.isBinaryExpression(p) && p.right === u && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(p.operatorToken.kind)) continue;
      if (ts.isConditionalExpression(p) && (p.whenTrue === u || p.whenFalse === u)) continue;
      if (ts.isJsxExpression(p) && u !== x) return { node: p, expr: u };
      break;
    }
    return { node: x, expr: null };
  };
  // Every condition ABOVE the block (`a && …`, `a ? … : …`) is checked again at the top of the
  // section: it already holds whenever the parent renders it, and it gives TypeScript back the
  // narrowing the block was written under.
  const guardsOf = (from, stop) => {
    const g = [];
    for (let u = from, p = from.parent; p && u !== stop; u = p, p = p.parent) {
      if (ts.isBinaryExpression(p) && p.right === u && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) g.unshift(`!(${p.left.getText(sf)})`);
      if (ts.isConditionalExpression(p) && p.whenTrue === u) g.unshift(`!(${p.condition.getText(sf)})`);
      if (ts.isConditionalExpression(p) && p.whenFalse === u) g.unshift(`(${p.condition.getText(sf)})`);
    }
    return g;
  };
  // Early returns before the markup (`if (!share) return …`) narrow what the markup reads; each one a
  // section can read is repeated at its top (the component has already returned in those cases).
  const earlyGuards = fn.body.statements
    .filter((st) => ts.isIfStatement(st) && st !== ret && (ts.isReturnStatement(st.thenStatement) || (ts.isBlock(st.thenStatement) && st.thenStatement.statements.some(ts.isReturnStatement))))
    .map((st) => `(${st.expression.getText(sf)})`)
    .filter((g) => okBlock(parse(g).statements[0]));
  const pick = cands.map((c) => {
    const unit = c.iife ? { node: c.iife, expr: c.x } : unitOf(c.x);
    const guards = [...earlyGuards, ...guardsOf(unit.node, ret.expression)];
    const probe = ts.factory ? null : null;
    const free = okBlock(unit.expr ?? c.x);
    const guardFree = guards.length ? okBlock(parse(`(${guards.join(') || (')})`).statements[0]) : [];
    return { ...c, unit, guards, free: free && guardFree ? [...new Set([...free, ...guardFree])] : null };
  }).find((c) => c.free);
  if (!pick) break;
  // A name for it: the first translation key inside (`t("reports.schedule.title")` → ScheduleSection).
  const keyMatch = (pick.unit.expr ?? pick.x).getText(sf).match(/\bt\(\s*["'`]([\w.]+)["'`]/);
  const seg = keyMatch ? keyMatch[1].split('.').filter((p) => !/^(title|label|heading|subtitle|desc|description)$/.test(p)) : [];
  let base = (seg[1] ?? seg[0] ?? 'part').replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase());
  base = base.charAt(0).toUpperCase() + base.slice(1);
  let secName = `${name}${base}`;
  let n = 2;
  while (sections.some((s) => s.secName === secName) || existsSync(join(dirname(file), `${kebab(secName)}.tsx`)) || existsSync(join('apps/mobile/src/screens', `${kebab(secName)}.tsx`))) secName = `${name}${base}${n++}`;
  const used = pick.free.filter((x) => fromHook.has(x));
  const props = pick.free.filter((x) => (paramNames.has(x) || viewNames.has(x)) && !fromHook.has(x));
  const importsUsed = pick.free.filter((x) => imported.has(x));
  const node = pick.unit.node;
  const elText = pick.unit.expr ? `<>{${pick.unit.expr.getText(sf)}}</>` : pick.x.getText(sf);
  const ind = (src.slice(src.lastIndexOf('\n', node.getStart(sf)) + 1, node.getStart(sf)).match(/^\s*/) || [''])[0];
  // Re-indent the block to the section's own depth.
  const shift = (t) => t.split('\n').map((l, i) => (i === 0 ? l : l.startsWith(ind) ? '    ' + l.slice(ind.length) : l)).join('\n');
  sections.push({ secName, used, props, importsUsed, elText: shift(elText), guards: pick.guards });
  src = src.slice(0, node.getStart(sf)) + `<${secName} ${P}={${P}}${props.map((x) => ` ${x}={${x}}`).join('')} />` + src.slice(node.getEnd());
}
if (!sections.length) fail('no block could move (each reads a name that is not from the hook)');

// Section files: the imports each block uses, re-based; the hook's state type.
const sf = parse(src);
const imports = sf0.statements.filter(ts.isImportDeclaration);
// Expo Router: every file under apps/mobile/app/ is a route, so sections live under src/screens/.
const dir = /(^|\/)apps\/mobile\/app\//.test(file)
  ? join('apps/mobile/src/screens', dirname(file).replace(/^.*apps\/mobile\/app\/?/, '').replace(/[()]/g, ''))
  : dirname(file);
const outFiles = [];
const rebase = (spec) => {
  if (!spec.startsWith('.')) return spec;
  if (resolve(dirname(file)) === resolve(dir)) return spec;
  let r = relative(dir, resolve(dirname(file), spec)).split('\\').join('/');
  if (!r) r = '.';
  return r.startsWith('.') ? r : './' + r;
};
for (const sec of sections) {
  const target = join(dir, `${kebab(sec.secName)}.tsx`);
  const need = new Set(sec.importsUsed);
  const lines = [];
  for (const im of imports) {
    const c = im.importClause;
    if (!c) continue;
    const spec = rebase(im.moduleSpecifier.text);
    const nb = c.namedBindings;
    if (nb && ts.isNamespaceImport(nb)) { if (need.has(nb.name.text)) lines.push(`import * as ${nb.name.text} from ${quote}${spec}${quote}${semi}`); continue; }
    const def = c.name && need.has(c.name.text) ? c.name.text : null;
    const parts = nb && ts.isNamedImports(nb) ? nb.elements.filter((e) => need.has(e.name.text) && e.name.text !== hookName).map((e) => e.getText(sf0)) : [];
    if (!def && !parts.length) continue;
    const head = [def, parts.length ? `{ ${parts.join(', ')} }` : null].filter(Boolean).join(', ');
    let l = `import ${c.isTypeOnly ? 'type ' : ''}${head} from ${quote}${spec}${quote}${semi}`;
    if (l.length > 110 && parts.length) l = `import ${c.isTypeOnly ? 'type ' : ''}${def ? def + ', ' : ''}{\n  ${parts.join(',\n  ')},\n} from ${quote}${spec}${quote}${semi}`;
    lines.push(l);
  }
  lines.push(`import type { ${stateType} } from ${quote}${rebase(hookSpec)}${quote}${semi}`);
  if (sec.props.some((x) => viewNames.has(x)) && viewImport) lines.push(`import type { ${viewName} } from ${quote}${rebase(viewImport.moduleSpecifier.text)}${quote}${semi}`);
  if (sec.props.some((x) => paramNames.has(x))) {
    let cs = relative(dir, file).replace(/\.tsx?$/, ''); if (!cs.startsWith('.')) cs = './' + cs;
    lines.push(isDefaultExport ? `import type ${name} from ${quote}${cs}${quote}${semi}` : `import type { ${name} } from ${quote}${cs}${quote}${semi}`);
  }
  const destructure = sec.used.length <= 6 ? `{ ${sec.used.join(', ')} }` : `{\n${sec.used.map((u) => `    ${u},`).join('\n')}\n  }`;
  const body = [
    ...(/^["']use client["']/.test(src) ? [`${quote}use client${quote}${semi}`, ''] : []),
    ...lines,
    '',
    `/** Part of ${name}'s markup, moved here unchanged; it reads the page's state from \`${P}\`. */`,
    `export function ${sec.secName}({ ${[P, ...sec.props].join(', ')} }: { ${[`${P}: ${stateType}`, ...sec.props.map((x) => { if (viewNames.has(x)) return `${x}: ReturnType<typeof ${viewName}>['${x}']`; const t = `Parameters<typeof ${name}>[0]['${paramKey.get(x) ?? x}']`; return `${x}: ${paramDefaulted.has(x) ? `NonNullable<${t}>` : t}`; })].join('; ')} }) {`,
    ...(sec.used.length ? [`  const ${destructure} = ${P}${semi}`] : []),
    ...sec.guards.map((g) => `  if (${g}) return null${semi}`),
    `  return (`,
    `    ${sec.elText}`,
    `  )${semi}`,
    `}`,
    '',
  ].join('\n');
  outFiles.push([target, body]);
}
// The source imports the sections; the hook file exports the state type once.
let specFor = (t) => { let r = relative(dirname(file), t).replace(/\.tsx$/, ''); return r.startsWith('.') ? r : './' + r; };
const imps = sf.statements.filter(ts.isImportDeclaration);
const last = imps.at(-1);
const at = src.indexOf('\n', src.indexOf(last.getText(sf)) + last.getText(sf).length) + 1;
src = src.slice(0, at) + outFiles.map(([t]) => `import { ${sections[outFiles.findIndex((o) => o[0] === t)].secName} } from ${quote}${specFor(t)}${quote}${semi}\n`).join('') + src.slice(at);
const hookPath = resolve(dirname(file), hookSpec) + (existsSync(resolve(dirname(file), hookSpec) + '.ts') ? '.ts' : '.tsx');
let hookSrc = readFileSync(hookPath, 'utf8');
if (!hookSrc.includes(`export type ${stateType}`)) hookSrc = hookSrc.replace(/\n*$/, `\n\n/** What ${name} and its sections read. */\nexport type ${stateType} = ReturnType<typeof ${hookName}>${semi}\n`);

// A section typed from the component's props imports its type, so the component must be exported.
if (sections.some((x) => x.props.some((p) => paramNames.has(p))) && !ts.getModifiers?.(fn0)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
  src = src.replace(new RegExp(`^(\\s*)((?:async\\s+)?function ${name}\\b)`, 'm'), '$1export $2');
}
console.log(`${file}: ${src.split('\n').length} lines; ${outFiles.map(([t, b]) => `${t.split('/').pop()} ${b.split('\n').length}`).join(', ')}`);
if (write) {
  writeFileSync(file, src);
  writeFileSync(hookPath, hookSrc);
  for (const [t, b] of outFiles) mkdirSync(dirname(t), { recursive: true }), writeFileSync(t, b);
}
