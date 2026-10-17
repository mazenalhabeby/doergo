#!/usr/bin/env node
/**
 * Wrap string literals that sit on a line over 140 characters.
 *
 *   node tools/wrap-long-strings.mjs <files…> [--dry]
 *
 * A long "a b c" becomes ("a b " + "c") — the SAME string at runtime, so nothing
 * changes but the layout; Prettier then puts the pieces on their own lines. A JSX
 * attribute (className="…") becomes className={"…" + "…"}.
 *
 * Never touched, because a piece there would be a type error or change meaning:
 * literal TYPES, import/export paths, property NAMES, directives ('use client'),
 * tagged templates, template literals with ${…}, and strings without a space to
 * split at. Class tokens are never cut: splits happen only after a space, so a
 * Tailwind scanner still sees every class whole.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const MAX = 140;
const PIECE = 72;

/** Cut after spaces into pieces of about PIECE characters; the pieces join back exactly. */
function pieces(text) {
  const out = [];
  let rest = text;
  while (rest.length > PIECE) {
    let cut = rest.lastIndexOf(' ', PIECE);
    if (cut <= 0) cut = rest.indexOf(' ', PIECE);
    if (cut <= 0 || cut === rest.length - 1) break;
    out.push(rest.slice(0, cut + 1));
    rest = rest.slice(cut + 1);
  }
  out.push(rest);
  return out;
}

function quoteLike(raw, body) {
  const q = raw[0];
  return q + body + q;
}

function skip(node) {
  const p = node.parent;
  if (!p) return true;
  if (ts.isLiteralTypeNode(p)) return true;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p)) return true;
  if (ts.isImportTypeNode?.(p.parent ?? p)) return true;
  if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isPropertySignature(p) ||
       ts.isMethodDeclaration(p) || ts.isEnumMember(p)) && p.name === node) return true;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true;
  if (ts.isExpressionStatement(p) && ts.isSourceFile(p.parent)) return true; // directive
  if (ts.isCallExpression(p) && p.expression.kind === ts.SyntaxKind.ImportKeyword) return true;
  if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === 'require') return true;
  if (ts.isTaggedTemplateExpression(p)) return true;
  if (ts.isCaseClause(p)) return true;
  return false;
}

function wrapFile(file, dry) {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const longLine = new Set();
  lines.forEach((l, i) => l.length > MAX && longLine.add(i));
  if (!longLine.size) return 0;

  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, kind);
  const edits = [];

  const visit = (node) => {
    const isStr = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
    if (isStr && !skip(node)) {
      const start = node.getStart(sf);
      const { line } = sf.getLineAndCharacterOfPosition(start);
      const raw = src.slice(start, node.end);
      const body = raw.slice(1, -1);
      // Only single-line literals on a long line, long enough to matter.
      if (longLine.has(line) && !raw.includes('\n') && body.length > 40 && body.includes(' ')) {
        const parts = pieces(body);
        const joined = parts.map((p) => quoteLike(raw, p)).join(' + ');
        // Proof, per edit: both are plain literals, so evaluating them is safe — they must be the same string.
        if (parts.length > 1 && parts.join('') === body && (0, eval)(`(${raw})`) === (0, eval)(`(${joined})`)) {
          const inJsxAttr = ts.isJsxAttribute(node.parent);
          edits.push({ start, end: node.end, text: inJsxAttr ? `{${joined}}` : `(${joined})` });
        }
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!edits.length) return 0;

  let out = src;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  if (!dry) fs.writeFileSync(file, out);
  return edits.length;
}

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length) {
  console.error('usage: node tools/wrap-long-strings.mjs <files…> [--dry]');
  process.exit(1);
}
let total = 0;
for (const f of files) {
  const n = wrapFile(f, dry);
  if (n) console.log(`${dry ? 'would wrap' : 'wrapped'} ${n} string(s) in ${f}`);
  total += n;
}
console.log(`wrap-long-strings: ${total} string(s) in ${files.length} file(s)`);
