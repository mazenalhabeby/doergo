#!/usr/bin/env node
/**
 * `const { a, b, … } = useX(args);` → `const vm = useX(args);` and every reference to a/b/…
 * (resolved by the TypeScript checker to THAT binding, so shadowing names are left alone)
 * becomes vm.a / vm.b. A shorthand `{ a }` becomes `{ a: vm.a }`.
 * usage: node unpack-to-object.cjs <file> <hookName> [--var vm] [--keep a,b]  (kept names stay unpacked)
 */
const fs = require('fs');
const path = require('path');
const ts = require(require.resolve('typescript', { paths: [process.cwd()] }));

const [file, hook] = process.argv.slice(2);
const varName = process.argv.includes('--var') ? process.argv[process.argv.indexOf('--var') + 1] : 'vm';
const keep = new Set(process.argv.includes('--keep') ? process.argv[process.argv.indexOf('--keep') + 1].split(',') : []);
const abs = path.resolve(file);
const program = ts.createProgram([abs], { jsx: ts.JsxEmit.ReactJSX, allowJs: false, noResolve: true, skipLibCheck: true });
const sf = program.getSourceFile(abs);
const checker = program.getTypeChecker();
const src = sf.getFullText();

let decl = null;
(function find(n) {
  if (decl) return;
  if (ts.isVariableDeclaration(n) && ts.isObjectBindingPattern(n.name) && n.initializer && ts.isCallExpression(n.initializer)
      && n.initializer.expression.getText(sf) === hook) decl = n;
  ts.forEachChild(n, find);
})(sf);
if (!decl) { console.error(`${file}: no destructure of ${hook}()`); process.exit(1); }
for (const el of decl.name.elements) {
  if (el.propertyName || el.initializer || el.dotDotDotToken) { console.error(`${file}: renames/defaults/rest — refused`); process.exit(1); }
}
const bound = new Map(decl.name.elements.map((el) => [checker.getSymbolAtLocation(el.name), el.name.text]));
if (src.match(new RegExp(`\\b${varName}\\b`))) { console.error(`${file}: "${varName}" already used`); process.exit(1); }

const edits = [];
(function walk(n) {
  if (ts.isIdentifier(n) && n.parent !== undefined && !decl.name.elements.some((e) => e.name === n)) {
    const sym = checker.getSymbolAtLocation(n);
    const name = sym && bound.get(sym);
    // A shorthand property's identifier resolves to the property; ask for the value symbol.
    const valueSym = ts.isShorthandPropertyAssignment(n.parent) ? checker.getShorthandAssignmentValueSymbol(n.parent) : null;
    const shortName = valueSym && bound.get(valueSym);
    if (shortName && !keep.has(shortName)) edits.push({ s: n.getStart(sf), e: n.end, t: `${shortName}: ${varName}.${shortName}` });
    else if (name && !keep.has(name) && !ts.isShorthandPropertyAssignment(n.parent)) edits.push({ s: n.getStart(sf), e: n.end, t: `${varName}.${name}` });
  }
  ts.forEachChild(n, walk);
})(sf);

const kept = decl.name.elements.map((e) => e.name.text).filter((n) => keep.has(n));
const callText = decl.initializer.getText(sf);
const declText = kept.length ? `${varName} = ${callText};\n  const { ${kept.join(', ')} } = ${varName}` : `${varName} = ${callText}`;
edits.push({ s: decl.getStart(sf), e: decl.end, t: declText });
let out = src;
for (const ed of edits.sort((a, b) => b.s - a.s)) out = out.slice(0, ed.s) + ed.t + out.slice(ed.e);
fs.writeFileSync(abs, out);
console.log(`${file}: ${decl.name.elements.length} names → ${varName}.x (${edits.length - 1} references)`);
