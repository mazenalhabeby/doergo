#!/usr/bin/env node
// Re-print ONLY the lines over 140 chars with Prettier: the node that starts at the line's
// first token is printed alone (inside a wrapper giving it context), re-indented, spliced
// back. Proof: TypeScript printer output (layout-blind) must be identical, else not written.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const prettier = require('prettier');
const MAX = 140;

const parse = (file, text) =>
  ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
/** JSX's own rule for text children (what React receives): lines trimmed inside, empty lines dropped. */
function jsxText(raw) {
  const lines = raw.split(/\r?\n/);
  const out = [];
  lines.forEach((l, k) => {
    let t = l.replace(/\t/g, ' ');
    if (k > 0) t = t.replace(/^ +/, '');
    if (k < lines.length - 1) t = t.replace(/ +$/, '');
    if (t) out.push(t);
  });
  return out.join(' ');
}
const isJsx = (n) => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n);
/** The code as a token list: layout-blind, JSX text as React sees it, parens around JSX and trailing commas ignored. */
function shape(file, text) {
  const sf = parse(file, text);
  const out = [];
  const walk = (n) => {
    if (ts.isJsxText(n)) { const t = jsxText(n.text); if (t) out.push('#' + t); return; }
    if (ts.isParenthesizedExpression(n) && isJsx(n.expression)) { walk(n.expression); return; }
    if (n.kind >= ts.SyntaxKind.FirstToken && n.kind <= ts.SyntaxKind.LastToken) { out.push(n.getText(sf)); return; }
    n.getChildren(sf).forEach(walk);
  };
  walk(sf);
  const toks = out.filter((t, k) => !((t === ',' || t === ';') && [')', ']', '}', '>'].includes(out[k + 1])));
  return toks.join('\u0001');
}

function wrapperFor(node) {
  const p = node.parent;
  if (ts.isJsxAttribute(node) || ts.isJsxSpreadAttribute(node)) return ['<X\n', '\n/>', 2];
  const jsx = ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node) || ts.isJsxExpression(node);
  if (jsx) return ['const __w = (\n  <>\n', '\n  </>\n);', 4];
  if (ts.isObjectLiteralElementLike(node) && ts.isObjectLiteralExpression(p)) return ['const __w = {\n', '\n};', 2];
  if (ts.isParameter(node)) return ['function __w(\n', '\n) {}', 2];
  if (ts.isClassElement(node)) return ['class __W {\n', '\n}', 2];
  if (ts.isTypeElement(node)) return ['interface __W {\n', '\n}', 2];
  if (ts.isEnumMember(node)) return ['enum __W {\n', '\n}', 2];
  if (ts.isCaseClause(node) || ts.isDefaultClause(node)) return ['switch (__x) {\n', '\n}', 2];
  if (ts.isArrayLiteralExpression(p)) return ['const __w = [\n', '\n];', 2];
  if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.arguments?.includes(node)) return ['__f(\n', '\n);', 2];
  if (ts.isStatement(node) && ts.isSourceFile(p)) return ['', '', 0];
  if (ts.isStatement(node)) return ['function __w() {\n', '\n}', 2];
  return null;
}

function nodeStartingAt(sf, pos) {
  let best = null;
  const visit = (n) => {
    if (n.kind !== ts.SyntaxKind.SyntaxList && n.getStart(sf) === pos && (!best || n.end > best.end)) best = n;
    if (n.pos <= pos && pos < n.end) n.getChildren(sf).forEach(visit);
  };
  visit(sf);
  // A JSX child line: prefer the JSX node over an inner expression starting at the same place.
  return best;
}

async function printAlone(file, text, wrapper, width, config) {
  const [before, after, inner] = wrapper;
  const out = await prettier.format(before + text + after, { ...config, filepath: file, printWidth: width });
  const lines = out.replace(/\n$/, '').split('\n');
  const head = before ? before.split('\n').length - 1 : 0;
  const tail = after ? after.split('\n').length - 1 : 0;
  return lines.slice(head, lines.length - tail).map((l) => (l.startsWith(' '.repeat(inner)) ? l.slice(inner) : l.trimStart()));
}


const CONT = new Set([ts.SyntaxKind.QuestionToken, ts.SyntaxKind.ColonToken, ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.PlusToken]);

/** A line that continues an expression (`? x`, `: y`, `&& z`): print the operand alone after the operator. */
async function continuation(file, src, sf, node, i, lineStart, line, indent, config) {
  const kids = node.parent.getChildren(sf);
  const nxt = kids[kids.indexOf(node) + 1];
  if (!nxt || sf.getLineAndCharacterOfPosition(nxt.end).line !== i) return null;
  const head = src.slice(node.getStart(sf), nxt.getStart(sf));
  const rest = src.slice(nxt.end, lineStart + line.length);
  const width = Math.max(60, 120 - indent.length - 2);
  const out = await prettier.format('const __w = ' + nxt.getText(sf) + ';', { ...config, filepath: file, printWidth: width });
  const ls = out.replace(/\n$/, '').split('\n');
  if (ls.length < 2 || !ls[0].startsWith('const __w = ')) return null;
  ls[0] = ls[0].slice('const __w = '.length);
  ls[ls.length - 1] = ls[ls.length - 1].replace(/;$/, '');
  return ls.map((l, j) => (j === 0 ? indent + head + l : l ? indent + '  ' + l : l)).join('\n') + rest;
}

/** A long FIRST line of a node that goes on (a function header, `useMemo(() => {`): close it with a marker, print, cut at the marker. */
async function prefixMode(file, src, sf, node, i, lineStart, line, indent, config) {
  const prefix = src.slice(node.getStart(sf), lineStart + line.length);
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, prefix);
  const stack = [];
  let lastTok = '';
  const pairs = { '(': ')', '[': ']', '{': '}' };
  for (let t = scanner.scan(); t !== ts.SyntaxKind.EndOfFileToken; t = scanner.scan()) {
    if (t === ts.SyntaxKind.WhitespaceTrivia || t === ts.SyntaxKind.NewLineTrivia) continue;
    if (t === ts.SyntaxKind.SingleLineCommentTrivia || t === ts.SyntaxKind.MultiLineCommentTrivia) return null;
    if (t === ts.SyntaxKind.TemplateHead || t === ts.SyntaxKind.Unknown) return null;
    const tx = scanner.getTokenText();
    if (pairs[tx]) stack.push(tx);
    else if (tx === ')' || tx === ']' || tx === '}') { if (pairs[stack.pop()] !== tx) return null; }
    lastTok = tx;
  }
  if (!stack.length || !pairs[lastTok]) return null;
  const closers = stack.reverse().map((o) => pairs[o]).join(' ');
  const wrapper = wrapperFor(node);
  if (!wrapper) return null;
  const width = Math.max(60, 120 - Math.max(0, indent.length - wrapper[2]));
  const printed = await printAlone(file, prefix + ' __KEEP__ ' + closers, wrapper, width, config);
  const at = printed.findIndex((l) => l.includes('__KEEP__'));
  if (at < 1) return null;
  const keep = printed.slice(0, at);
  const before = printed[at].slice(0, printed[at].indexOf('__KEEP__')).trimEnd();
  if (before.trim()) keep.push(before);
  keep[keep.length - 1] = keep[keep.length - 1].trimEnd();
  if (keep.length < 2 || !keep[keep.length - 1].endsWith(lastTok)) return null;
  return keep.map((l) => (l ? indent + l : l)).join('\n');
}

async function fixFile(file) {
  const config = (await prettier.resolveConfig(file)) ?? {};
  const original = fs.readFileSync(file, 'utf8');
  let src = original;
  const stuck = new Set();
  for (let guard = 0; guard < 400; guard++) {
    const lines = src.split('\n');
    const i = lines.findIndex((l) => l.length > MAX && !stuck.has(l));
    if (i < 0) break;
    const sf = parse(file, src);
    const lineStart = sf.getPositionOfLineAndCharacter(i, 0);
    const indent = lines[i].match(/^\s*/)[0];
    var node = nodeStartingAt(sf, lineStart + indent.length);
    const giveUp = (why = '?') => { stuck.add(lines[i]); if (process.env.DEBUG) console.error(`L${i + 1} ${why}: ${node ? ts.SyntaxKind[node.kind] : '-'} ${lines[i].trim().slice(0, 60)}`); };
    if (!node) { giveUp('no node'); continue; }
    let text;
    let opening = false;
    const endLine = sf.getLineAndCharacterOfPosition(node.end).line;
    const special = async (fn, why) => {
      let r = null;
      try { r = await fn(file, src, sf, node, i, lineStart, lines[i], indent, config); } catch { r = null; }
      if (r == null) { giveUp(why); return false; }
      const next = src.slice(0, lineStart) + r + src.slice(lineStart + lines[i].length);
      if (shape(file, next) !== shape(file, src)) { giveUp(why + ' shape'); return false; }
      src = next;
      return true;
    };
    if (CONT.has(node.kind)) { await special(continuation, 'continuation'); continue; }
    const openOnLine = ts.isJsxElement(node) && sf.getLineAndCharacterOfPosition(node.openingElement.end).line === i;
    if (endLine !== i && !openOnLine) { await special(prefixMode, 'prefix'); continue; }
    if (endLine !== i) {
      if (!ts.isJsxElement(node)) { giveUp('multiline'); continue; }
      const open = node.openingElement;
      if (sf.getLineAndCharacterOfPosition(open.end).line !== i) { giveUp('open multiline'); continue; }
      text = src.slice(open.getStart(sf), open.end - 1).replace(/\s*$/, '') + ' />';
      opening = true;
    } else {
      text = node.getText(sf);
    }
    const wrapper = wrapperFor(node);
    if (!wrapper) { giveUp('no wrapper'); continue; }
    const width = Math.max(60, 120 - Math.max(0, indent.length - wrapper[2]));
    let printed;
    try { printed = await printAlone(file, text, wrapper, width, config); } catch (e) { giveUp('prettier ' + String(e.message).slice(0, 80)); continue; }
    const endPos = opening ? node.openingElement.end : node.end;
    const rest = src.slice(endPos, lineStart + lines[i].length);
    if (!printed.length) { giveUp('empty print'); continue; }
    let last = printed[printed.length - 1];
    if (opening) {
      last = last.replace(/\s*\/>$/, '>');
      if (last.trim() === '>') { printed.pop(); last = printed[printed.length - 1] + '>'; }
    }
    if (last.endsWith(';') && !text.trimEnd().endsWith(';')) last = last.slice(0, -1);
    // The wrapper's trailing comma belongs to the wrapper; the source keeps its own (in `rest`).
    if (last.endsWith(',') && !text.trimEnd().endsWith(',')) last = last.slice(0, -1);
    printed[printed.length - 1] = last;
    const replaced = printed.map((l) => (l ? indent + l : l)).join('\n') + rest;
    if (replaced.split('\n').length === 1) { giveUp('one line'); continue; }
    const next = src.slice(0, lineStart) + replaced + src.slice(lineStart + lines[i].length);
    // Proof per edit, so one bad edit does not cost the whole file.
    if (shape(file, next) !== shape(file, src)) { giveUp('shape'); continue; }
    src = next;
  }
  if (src !== original) fs.writeFileSync(file, src);
  return src.split('\n').filter((l) => l.length > MAX).length;
}

for (const f of process.argv.slice(2)) {
  const left = await fixFile(f);
  console.log(`${f}: ${fs.readFileSync(f, 'utf8').split('\n').length} lines, ${left} long left`);
}
