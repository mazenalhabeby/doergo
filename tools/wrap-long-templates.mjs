#!/usr/bin/env node
/**
 * Wrap a template literal WITH ${…} that sits on a line over 140 characters.
 *
 *   node tools/wrap-long-templates.mjs <files…>
 *
 * `${MONO} inline-flex … hover:opacity-90` becomes
 * (`${MONO} inline-flex … ` + `rounded-full … hover:opacity-90`): the text between the
 * values is cut only after a space, each ${…} stays whole and in its place, so the
 * pieces evaluate the same expressions in the same order and join to the same string.
 * Proof per edit: the pieces' inner text, concatenated, equals the original's.
 * Tagged templates, and templates whose TEXT spans lines, are left alone. tools/split-long-templates.mjs
 * cuts at a ${ boundary instead; this one also handles a single value followed by a
 * long run of text (most class strings). Run tools/break-long-lines-ast.mjs after it
 * to put the pieces on their own lines.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const MAX = 140;
const PIECE = 72;

/** The template's inner text as static runs and whole `${…}` tokens. */
function tokens(src, sf, node) {
  const out = [];
  let at = node.getStart(sf) + 1;
  let prev = node.head;
  for (const span of node.templateSpans) {
    // The "${" ends the previous literal (the value itself may start on the next line).
    const open = prev.end - 2;
    prev = span.literal;
    const close = span.literal.getStart(sf) + 1; // just past the "}"
    if (open > at) out.push({ kind: 'text', raw: src.slice(at, open) });
    out.push({ kind: 'value', raw: src.slice(open, close) });
    at = close;
  }
  const end = node.end - 1; // before the closing backtick
  if (end > at) out.push({ kind: 'text', raw: src.slice(at, end) });
  return out;
}

/** Pack tokens into pieces of about PIECE characters, cutting text only after an unescaped space. */
function pack(toks) {
  const pieces = [];
  let cur = '';
  for (const t of toks) {
    if (t.kind === 'value') {
      if (cur.length && cur.length + t.raw.length > PIECE && /[^\\] $/.test(cur)) {
        pieces.push(cur);
        cur = '';
      }
      cur += t.raw;
      continue;
    }
    let rest = t.raw;
    while (cur.length + rest.length > PIECE) {
      const room = PIECE - cur.length;
      let cut = -1;
      for (let i = Math.min(room, rest.length - 1); i > 0; i--) {
        if (rest[i - 1] === ' ' && rest[i - 2] !== '\\') {
          cut = i;
          break;
        }
      }
      if (cut <= 0) {
        if (cur.length) {
          pieces.push(cur);
          cur = '';
          continue;
        }
        break;
      }
      pieces.push(cur + rest.slice(0, cut));
      cur = '';
      rest = rest.slice(cut);
    }
    cur += rest;
  }
  if (cur.length) pieces.push(cur);
  return pieces;
}

let total = 0;
for (const file of process.argv.slice(2)) {
  let src = fs.readFileSync(file, 'utf8');
  const long = new Set(
    src
      .split('\n')
      .map((l, i) => ([...l].length > MAX ? i : -1))
      .filter((i) => i >= 0),
  );
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, kind);
  const edits = [];
  const visit = (n) => {
    if (ts.isTemplateExpression(n) && !ts.isTaggedTemplateExpression(n.parent)) {
      const start = n.getStart(sf);
      const text = src.slice(start, n.end);
      const toks = tokens(src, sf, n);
      // A line break inside a ${…} value is layout; one in the text would be part of the string — left alone.
      const textBreaks = toks.some((t) => t.kind === 'text' && t.raw.includes('\n'));
      if (long.has(sf.getLineAndCharacterOfPosition(start).line) && !textBreaks) {
        const pieces = pack(toks);
        // Proof: the pieces join back to the exact inner text.
        if (pieces.length > 1 && pieces.join('') === text.slice(1, -1)) {
          edits.push({ start, end: n.end, text: `(${pieces.map((p) => '`' + p + '`').join(' + ')})` });
          return;
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  for (const e of edits.sort((a, b) => b.start - a.start)) src = src.slice(0, e.start) + e.text + src.slice(e.end);
  if (edits.length) {
    fs.writeFileSync(file, src);
    console.log(`wrapped ${edits.length} template(s) in ${file}`);
  }
  total += edits.length;
}
console.log(`wrap-long-templates: ${total} template(s)`);
