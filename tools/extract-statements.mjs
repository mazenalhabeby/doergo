#!/usr/bin/env node
/**
 * Move named top-level statements out of a file into a NEW sibling file — MOVE ONLY.
 * The source stays the entry point (a Next.js page keeps its default export) and
 * imports back what it still uses; an exported name stays exported from the source.
 *
 *   node tools/extract-statements.mjs <source> <target> <name,name,…> ["doc line"] [--write]
 *
 * A moved statement keeps its leading comments. The target gets exactly the imports
 * its code uses (paths re-based) and the source's 'use client' directive. Refused:
 * a moved statement that uses a name staying in the source (the two files would
 * import each other), and a name that is not a top-level statement.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const args = process.argv.slice(2);
const write = args.includes('--write');
const [source, target, namesArg, doc] = args.filter((a) => a !== '--write');
const names = new Set(namesArg.split(',').map((s) => s.trim()).filter(Boolean));
if (existsSync(target)) throw new Error(`${target} exists — pick a new file`);

const src = readFileSync(source, 'utf8');
const sf = ts.createSourceFile(source, src, ts.ScriptTarget.Latest, true, source.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

const declared = (st) => {
  if (ts.isVariableStatement(st)) {
    // `const { width: SCREEN_WIDTH } = …` declares SCREEN_WIDTH: walk the binding pattern.
    const names = (b) => (ts.isIdentifier(b) ? [b.text] : b.elements.flatMap((e) => (ts.isOmittedExpression(e) ? [] : names(e.name))));
    return st.declarationList.declarations.flatMap((d) => names(d.name));
  }
  return st.name && ts.isIdentifier(st.name) ? [st.name.text] : [];
};
const isExported = (st) => !!ts.getModifiers?.(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
const isDefault = (st) => !!ts.getModifiers?.(st)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);

/** Identifiers a node reads (a cheap over-approximation: every identifier in it). */
function idsIn(node) {
  const out = new Set();
  const walk = (n) => {
    if (ts.isIdentifier(n)) out.add(n.text);
    n.forEachChild(walk);
  };
  walk(node);
  return out;
}
/** From the end of the previous statement's line to the end of this one's line. */
function span(st) {
  let start = st.getFullStart();
  // The rest of the previous statement's line (a trailing comment) stays with it.
  if (start > 0 && src[start - 1] !== '\n') {
    const nl = src.indexOf('\n', start);
    if (nl !== -1 && nl < st.getStart(sf)) start = nl + 1;
  }
  // The file's own doc comment, separated by a blank line, stays in the source.
  if (st === firstStatement) {
    // Only a blank line BETWEEN comments counts — never one inside a block comment. The cut then
    // starts at the next comment (or the statement), so the kept doc keeps its own line ending.
    const ranges = ts.getLeadingCommentRanges(src, st.getFullStart()) ?? [];
    const starts = [...ranges.map((r) => r.pos).slice(1), st.getStart(sf)];
    for (let k = ranges.length - 1; k >= 0; k--) {
      if (/\n[ \t]*\n/.test(src.slice(ranges[k].end, starts[k]))) {
        start = src.lastIndexOf('\n', starts[k] - 1) + 1;
        break;
      }
    }
  }
  let end = st.getEnd();
  const eol = src.indexOf('\n', end);
  const tail = src.slice(end, eol === -1 ? src.length : eol);
  if (/^\s*(\/\/.*)?$/.test(tail)) end = eol === -1 ? src.length : eol + 1;
  return [start, end];
}

const imports = [];
let directive = null;
let firstStatement = null;
const moved = [];
const stay = [];
for (const st of sf.statements) {
  if (ts.isImportDeclaration(st)) { imports.push(st); continue; }
  if (ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression) && /^use (client|server)$/.test(st.expression.text)) {
    directive = st.expression.text;
    continue;
  }
  firstStatement ??= st;
  const d = declared(st);
  if (d.length && d.every((n) => names.has(n))) moved.push(st);
  else stay.push(st);
}
const found = new Set(moved.flatMap(declared));
const missing = [...names].filter((n) => !found.has(n));
if (missing.length) throw new Error(`not top-level statements here: ${missing.join(', ')}`);
if (moved.some(isDefault)) throw new Error('the default export stays in the source');

// A moved statement may not read a name that stays (the files would import each other).
const stayNames = new Set(stay.flatMap(declared));
const movedIds = new Set(moved.flatMap((st) => [...idsIn(st)]));
const back = [...stayNames].filter((n) => movedIds.has(n));
if (back.length) throw new Error(`moved code uses names that stay: ${back.join(', ')} — move them too`);

// Imports the target needs: each import's specifiers that its code reads, path re-based.
const rebase = (spec) => {
  if (!spec.startsWith('.')) return spec;
  if (resolve(dirname(source)) === resolve(dirname(target))) return spec;
  let r = relative(dirname(target), resolve(dirname(source), spec)).split('\\').join('/');
  if (!r) r = '.';
  return r.startsWith('.') ? r : './' + r;
};
const importLines = [];
for (const im of imports) {
  const clause = im.importClause;
  const spec = rebase(im.moduleSpecifier.text);
  if (!clause) continue;
  const parts = [];
  const def = clause.name && movedIds.has(clause.name.text) ? clause.name.text : null;
  const nb = clause.namedBindings;
  if (nb && ts.isNamespaceImport(nb)) {
    if (movedIds.has(nb.name.text)) importLines.push(`import ${clause.isTypeOnly ? 'type ' : ''}* as ${nb.name.text} from '${spec}';`);
    continue;
  }
  if (nb && ts.isNamedImports(nb))
    for (const el of nb.elements) if (movedIds.has(el.name.text)) parts.push(el.getText(sf));
  if (!def && !parts.length) continue;
  const head = [def, parts.length ? `{ ${parts.join(', ')} }` : null].filter(Boolean).join(', ');
  importLines.push(`import ${clause.isTypeOnly ? 'type ' : ''}${head} from '${spec}';`);
}

// Target text: directive, imports, doc, then each moved statement exported.
const quote = src.includes(`"use client"`) || /from "/.test(src) ? '"' : "'";
const semi = /from ['"][^'"]+['"];/.test(src) ? ';' : '';
const wrap = (line) => {
  const m = line.match(/^((?:import|export)(?: type)? )(?:(\w+), )?\{ (.*) \}( from .*)$/);
  if (!m || line.length <= 110) return line;
  return `${m[1]}${m[2] ? m[2] + ', ' : ''}{\n  ${m[3].split(', ').join(',\n  ')},\n}${m[4]}`;
};
const q = (s) => wrap(s.replace(/'/g, quote).replace(/;$/, semi));
const body = moved.map((st) => {
  const [a, b] = span(st);
  let text = src.slice(a, b).replace(/^\s*\n/, '');
  if (!isExported(st)) text = text.replace(new RegExp(`^((?:\\s*(?://.*|/\\*[\\s\\S]*?\\*/)\\s*\\n)*\\s*)(?=(?:async\\s+)?(?:function|const|let|class|type|interface|enum)\\b)`), '$1export ');
  return text.replace(/\n*$/, '\n');
});
const targetText = [
  ...(directive ? [`${quote}${directive}${quote}${semi}`, ''] : []),
  ...importLines.map(q),
  '',
  ...(doc ? [`/** ${doc} */`] : []),
  body.join('\n'),
].join('\n').replace(/\n{3,}/g, '\n\n');

// Source text: moved statements cut, one import of what it still uses, exported names re-exported.
let out = src;
for (const st of [...moved].reverse()) {
  const [a, b] = span(st);
  out = out.slice(0, a) + out.slice(b);
}
const restIds = new Set();
{
  const restSf = ts.createSourceFile(source, out, ts.ScriptTarget.Latest, true, source.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  for (const st of restSf.statements) if (!ts.isImportDeclaration(st)) for (const i of idsIn(st)) restIds.add(i);
}
const movedNames = moved.flatMap(declared);
const usedBack = movedNames.filter((n) => restIds.has(n));
const reExport = moved.filter(isExported).flatMap(declared).filter((n) => !usedBack.includes(n));
let spec = relative(dirname(source), target).replace(/\.(tsx?|mts)$/, '').split('\\').join('/');
if (!spec.startsWith('.')) spec = './' + spec;
// Types travel as `import type` / `export type` (isolatedModules).
const typeNames = new Set(moved.filter((st) => ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)).flatMap(declared));
const named = (list) => list.map((n) => (typeNames.has(n) ? `type ${n}` : n)).join(', ');
const add = [];
if (usedBack.length) add.push(`import { ${named(usedBack)} } from '${spec}';`);
const exportedUsedBack = moved.filter(isExported).flatMap(declared).filter((n) => usedBack.includes(n));
if (exportedUsedBack.length || reExport.length) add.push(`export { ${named([...exportedUsedBack, ...reExport])} } from '${spec}';`);
// After the source's LAST import (its end, not its first line — an import can span lines).
const lastImport = imports.at(-1);
const at = lastImport ? out.indexOf('\n', out.indexOf(lastImport.getText(sf)) + lastImport.getText(sf).length) + 1 : 0;
out = out.slice(0, at) + add.map(q).join('\n') + (add.length ? '\n' : '') + out.slice(at);
out = out.replace(/\n{3,}/g, '\n\n');

console.log(`${target}: ${targetText.split('\n').length} lines; ${source}: ${out.split('\n').length} lines`);
if (write) {
  mkdirSync(dirname(target), { recursive: true }), writeFileSync(target, targetText);
  writeFileSync(source, out);
}
