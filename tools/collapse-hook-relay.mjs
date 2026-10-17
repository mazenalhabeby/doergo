#!/usr/bin/env node
/**
 * Collapse a hook that RELAYS its sub-hook's values.
 *
 *   node tools/collapse-hook-relay.mjs <file> <subHookName> [--dry]
 *
 * A hook split in two by the size work reads, in `file`:
 *
 *   const { a, b, c, …50 names } = useXData(args)
 *   …the hook's own code, using a few of them…
 *   return { a, b, c, …50 names again, ownHandler }
 *
 * It becomes:
 *
 *   const xData = useXData(args)
 *   const { a } = xData            // only the names the hook's own code uses
 *   …unchanged…
 *   return { ...xData, ownHandler } // the relayed names come from the spread
 *
 * Same hooks in the same order and the same values; the returned object may carry
 * a few more keys (the ones the relay used to drop) — callers read named fields,
 * so nothing reads them. A name the hook redefines is never relayed (it would not
 * compile), and every own entry stays after the spread, so it wins as before.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const [file, callee] = process.argv.slice(2);
const dry = process.argv.includes('--dry');
if (!file || !callee) {
  console.error('usage: node tools/collapse-hook-relay.mjs <file> <subHookName> [--dry]');
  process.exit(1);
}

const src = fs.readFileSync(file, 'utf8');
const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

let decl = null;
let body = null;
const findDecl = (node) => {
  if (
    ts.isVariableDeclaration(node) &&
    ts.isObjectBindingPattern(node.name) &&
    node.initializer &&
    ts.isCallExpression(node.initializer) &&
    ts.isIdentifier(node.initializer.expression) &&
    node.initializer.expression.text === callee
  ) {
    decl = node;
    let p = node.parent;
    while (p && !(ts.isFunctionDeclaration(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p))) p = p.parent;
    body = p?.body;
    return;
  }
  ts.forEachChild(node, findDecl);
};
findDecl(sf);
if (!decl || !body || !ts.isBlock(body)) {
  console.error(`no "const { … } = ${callee}(…)" inside a function body in ${file}`);
  process.exit(1);
}

// Only plain `name` / `name: alias`-free bindings are handled.
const names = [];
for (const el of decl.name.elements) {
  if (el.propertyName || el.dotDotDotToken || el.initializer || !ts.isIdentifier(el.name)) {
    console.error(`binding "${el.getText(sf)}" is not a plain name — handle ${file} by hand`);
    process.exit(1);
  }
  names.push(el.name.text);
}

// The hook's own top-level return of an object literal.
const ret = body.statements.filter(ts.isReturnStatement).pop();
if (!ret || !ret.expression || !ts.isObjectLiteralExpression(ret.expression)) {
  console.error(`no top-level "return { … }" in the hook in ${file}`);
  process.exit(1);
}

// Which destructured names does the hook's own code use (outside the destructure and the return)?
const declStmt = decl.parent.parent; // VariableStatement
const used = new Set();
const scan = (node) => {
  if (node === declStmt || node === ret) return;
  if (ts.isIdentifier(node) && names.includes(node.text)) {
    const p = node.parent;
    // `x.name` and `{ name: … }` keys are not uses of the binding.
    const isPropName =
      (ts.isPropertyAccessExpression(p) && p.name === node) ||
      (ts.isPropertyAssignment(p) && p.name === node) ||
      (ts.isPropertySignature?.(p) && p.name === node);
    if (!isPropName) used.add(node.text);
  }
  ts.forEachChild(node, scan);
};
for (const st of body.statements) scan(st);

const keep = [];
let relayed = 0;
for (const prop of ret.expression.properties) {
  if (ts.isShorthandPropertyAssignment(prop) && names.includes(prop.name.text)) {
    relayed++;
    continue;
  }
  keep.push(prop.getText(sf));
}
if (relayed < 5) {
  console.error(`only ${relayed} relayed name(s) in ${file} — not worth collapsing`);
  process.exit(1);
}

const dataName = callee.replace(/^use/, '').replace(/^./, (c) => c.toLowerCase()) || 'data';
const args = decl.initializer.getText(sf);
const indent = src.slice(src.lastIndexOf('\n', declStmt.getStart(sf)) + 1, declStmt.getStart(sf));
const kw = declStmt.declarationList.flags & ts.NodeFlags.Const ? 'const' : 'let';
const usedList = names.filter((n) => used.has(n));
const newDecl =
  `${kw} ${dataName} = ${args}` +
  (usedList.length ? `\n${indent}const { ${usedList.join(', ')} } = ${dataName}` : '');
const retIndent = src.slice(src.lastIndexOf('\n', ret.getStart(sf)) + 1, ret.getStart(sf));
const inner = [`...${dataName}`, ...keep];
const newRet = `return {\n${inner.map((p) => `${retIndent}  ${p},`).join('\n')}\n${retIndent}}`;

let out = src;
// Replace from the end so offsets stay valid.
out = out.slice(0, ret.getStart(sf)) + newRet + out.slice(ret.end);
const semi = src[declStmt.end - 1] === ';' ? ';' : '';
out = out.slice(0, declStmt.getStart(sf)) + newDecl + semi + out.slice(declStmt.end);

if (dry) console.log(out);
else fs.writeFileSync(file, out);
console.log(
  `collapse-hook-relay: ${file}: ${relayed} relayed name(s) → ...${dataName}; ${usedList.length} still unpacked for own code`,
);
