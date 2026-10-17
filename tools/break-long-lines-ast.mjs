#!/usr/bin/env node
/**
 * Break lines over 140 characters at their OWN list, and touch nothing else.
 *
 *   node tools/break-long-lines-ast.mjs <files…>
 *
 * Prettier — even with a range — re-lays out the whole enclosing statement, so a
 * compact 280-line component with a few long lines comes back at 500 lines and has
 * to be split. This breaks only the long line: the outermost list on it (JSX
 * attributes, call arguments, parameters, object / array / import members, type
 * members, a `+ && || ??` chain, a `? :`) is put one item per line, Prettier-style.
 * Repeated until the file has no long line or nothing more can be broken.
 *
 * Proof, per file: the syntax tree before and after, as kinds and texts (no positions),
 * must be identical — JSX text included — or the file is left as it was.
 * Run tools/wrap-long-strings.mjs first: a string is never broken here.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const MAX = 140;

const parse = (file, text) =>
  ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

/** The tree as kinds and texts only — positions and layout are not part of it. */
function shape(file, text) {
  const out = [];
  const walk = (node) => {
    out.push(node.kind);
    if (typeof node.text === 'string' && !ts.isSourceFile(node)) out.push(JSON.stringify(node.text));
    ts.forEachChild(node, walk);
    out.push(')');
  };
  walk(parse(file, text));
  return out.join(' ');
}

const indentOf = (line) => line.match(/^\s*/)[0];

/** The pieces of `node` that would each go on their own line, or null. */
function listOf(node, sf) {
  const items = (arr) => (arr && arr.length ? [...arr] : null);
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    const attrs = items(node.attributes.properties);
    if (!attrs) return null;
    const closer = ts.isJsxSelfClosingElement(node) ? node.end - 2 : node.end - 1;
    return { items: attrs, closer, sep: null };
  }
  if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && node.arguments?.length) {
    // One object / array / function argument stays hugged — `useQuery({` — and its own list breaks.
    const only = node.arguments.length === 1 ? node.arguments[0] : null;
    if (only && (ts.isObjectLiteralExpression(only) || ts.isArrayLiteralExpression(only) ||
                 ts.isArrowFunction(only) || ts.isFunctionExpression(only))) return null;
    return { items: [...node.arguments], closer: node.end - 1, sep: ',' };
  }
  if (ts.isObjectLiteralExpression(node) || ts.isObjectBindingPattern(node) || ts.isTypeLiteralNode(node)) {
    const els = items(node.properties ?? node.elements ?? node.members);
    return els ? { items: els, closer: node.end - 1, sep: ',' } : null;
  }
  if (ts.isArrayLiteralExpression(node) || ts.isArrayBindingPattern(node) || ts.isNamedImports(node) || ts.isNamedExports(node)) {
    const els = items(node.elements);
    return els ? { items: els, closer: node.end - 1, sep: ',' } : null;
  }
  if ((ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node) ||
       ts.isFunctionExpression(node) || ts.isConstructorDeclaration(node)) && node.parameters.length) {
    const open = node.parameters.pos - 1;
    if (sf.text[open] !== '(') return null;
    // A short parameter list is not what makes the line long — break inside the body instead.
    if (node.parameters.end - node.parameters.pos < 60) return null;
    let closer = node.parameters.end;
    while (closer < sf.text.length && sf.text[closer] !== ')') closer++;
    return { items: [...node.parameters], closer, sep: ',' };
  }
  return null;
}

/** A chain of one operator (`a + b + c`, `a && b`), flattened left to right. */
const CHAIN_OPS = new Set([
  ts.SyntaxKind.PlusToken, ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);
function chainOf(node) {
  if (!ts.isBinaryExpression(node) || !CHAIN_OPS.has(node.operatorToken.kind)) return null;
  const op = node.operatorToken.kind;
  const ops = [];
  let left = node;
  while (ts.isBinaryExpression(left) && left.operatorToken.kind === op) {
    ops.unshift(left.operatorToken);
    left = left.left;
  }
  return ops.length ? ops : null;
}

/** Edits (replace whitespace before a position with a newline + indent) for the first breakable node on a line. */
function editsForLine(sf, lineIdx, lineText) {
  const lineStart = sf.getPositionOfLineAndCharacter(lineIdx, 0);
  const lineEnd = lineStart + lineText.length;
  const base = indentOf(lineText);
  const inner = base + '  ';
  const onLine = (pos) => pos >= lineStart && pos <= lineEnd;
  const ws = (pos) => {
    let s = pos;
    while (s > lineStart && (sf.text[s - 1] === ' ' || sf.text[s - 1] === '\t')) s--;
    return s;
  };
  // Nothing to do when the piece already starts its line.
  const breakAt = (pos, indent) => (ws(pos) === lineStart ? null : { start: ws(pos), end: pos, text: '\n' + indent });

  let found = null;
  const visit = (node) => {
    if (found) return;
    const start = node.getStart(sf);
    if (start > lineEnd || node.end < lineStart) return;
    if (onLine(start) || start < lineStart) {
      const list = listOf(node, sf);
      if (list && list.items.some((it) => onLine(it.getStart(sf)))) {
        const edits = [];
        for (const it of list.items) if (onLine(it.getStart(sf))) edits.push(breakAt(it.getStart(sf), inner));
        if (onLine(list.closer) && list.closer > list.items[list.items.length - 1].end) {
          edits.push(breakAt(list.closer, base));
        }
        while (edits.includes(null)) edits.splice(edits.indexOf(null), 1);
        if (edits.length > 1 || (edits.length === 1 && list.items.length === 1)) {
          found = edits;
          return;
        }
      }
      const ops = chainOf(node);
      if (ops && ops.some((o) => onLine(o.getStart(sf)))) {
        // Break AFTER each operator, Prettier's habit.
        found = ops
          .filter((o) => onLine(o.getStart(sf)))
          .map((o) => {
            let e = o.end;
            while (sf.text[e] === ' ') e++;
            // Already the end of its line: nothing to break.
            return sf.text[e] === '\n' || sf.text[e] === '\r' ? null : { start: o.end, end: e, text: '\n' + inner };
          })
          .filter(Boolean);
        if (found.length) return;
        found = null;
      }
      if (ts.isConditionalExpression(node) && onLine(node.questionToken.getStart(sf))) {
        found = [breakAt(node.questionToken.getStart(sf), inner)];
        if (onLine(node.colonToken.getStart(sf))) found.push(breakAt(node.colonToken.getStart(sf), inner));
        found = found.filter(Boolean);
        if (!found.length) found = null;
        else return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

function breakFile(file, maxLines) {
  const original = fs.readFileSync(file, 'utf8');
  // With a budget, a break that would take the file past it (or past its own length, if longer) is skipped.
  const cap = maxLines ? Math.max(maxLines + 1, original.split('\n').length) : Infinity;
  let text = original;
  const count = (t) => t.split('\n').filter((l) => l.length > MAX).length;
  const before = count(text);
  if (!before) return { before, after: 0 };
  const stuck = new Set();
  for (let round = 0; round < 400; round++) {
    const lines = text.split('\n');
    const idx = lines.findIndex((l, i) => l.length > MAX && !stuck.has(l));
    if (idx < 0) break;
    const sf = parse(file, text);
    const edits = editsForLine(sf, idx, lines[idx]);
    if (!edits || !edits.length) {
      stuck.add(lines[idx]);
      continue;
    }
    let next = text;
    for (const e of edits.sort((a, b) => b.start - a.start)) next = next.slice(0, e.start) + e.text + next.slice(e.end);
    if (next === text || next.split('\n').length > cap) {
      stuck.add(lines[idx]);
      continue;
    }
    text = next;
  }
  if (text === original) return { before, after: before };
  if (shape(file, text) !== shape(file, original)) {
    console.error(`break-long-lines: ${file} — code would change, left as it was`);
    return { before, after: before };
  }
  fs.writeFileSync(file, text);
  return { before, after: count(text) };
}

const argv = process.argv.slice(2);
const at = argv.indexOf('--max-lines');
const maxLines = at >= 0 ? Number(argv[at + 1]) : 0;
const files = argv.filter((a, i) => !a.startsWith('--') && (at < 0 || i !== at + 1));
if (!files.length) {
  console.error('usage: node tools/break-long-lines-ast.mjs <files…> [--max-lines 300]');
  process.exit(1);
}
let b = 0;
let a = 0;
for (const f of files) {
  const r = breakFile(f, maxLines);
  b += r.before;
  a += r.after;
}
console.log(`break-long-lines: ${b} → ${a} long line(s) in ${files.length} file(s)`);
