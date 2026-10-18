#!/usr/bin/env node
/**
 * Move one markup block of a `{ vm }` component into a section component, MOVE ONLY.
 *
 *   node tools/move-block.mjs <file> <firstLine> <lastLine> <SectionName> <new-file.tsx>
 *
 * For components written as  export function X({ vm }: { vm: State }) { const { a, b } = vm; return (…) }
 * — the shape extract-sections leaves behind and cannot split again. Lines firstLine..lastLine
 * (1-based, whole lines, one or more sibling elements) go to <new-file> as
 *     export function SectionName({ vm }: { vm: State }) { const { <names it reads> } = vm; return (<block/>) }
 * and are replaced by <SectionName vm={vm} />. The new file starts with a copy of the original's
 * imports; prune the unused ones after with
 *     npx tsc --noEmit -p <tsconfig> --noUnusedLocals | node tools/prune-imports.mjs <files…>
 * Refused when the block reads a name declared in the component other than through `vm`
 * (a value computed in the component must stay where it is computed).
 */
import fs from 'node:fs';
import path from 'node:path';

const [file, first, last, name, target] = process.argv.slice(2);
if (!target) {
  console.error('usage: node tools/move-block.mjs <file> <firstLine> <lastLine> <SectionName> <new-file.tsx>');
  process.exit(1);
}
const src = fs.readFileSync(file, 'utf8');
const lines = src.split('\n');
let a = Number(first) - 1;
let b = Number(last) - 1;
// Blank lines at either edge stay where they are.
while (a < b && !lines[a].trim()) a++;
while (b > a && !lines[b].trim()) b--;

// The component holding the block: `export function X(` whose props include `vm: State`.
let head = -1;
for (let i = a; i >= 0; i--) {
  if (/^export function \w+\(/.test(lines[i])) {
    head = i;
    break;
  }
}
if (head < 0) {
  console.error('move-block: no `export function X(` above the block');
  process.exit(1);
}
const parent = lines[head].match(/^export function (\w+)\(/)[1];
// The signature: from the head to the line that opens the body.
let sigEnd = head;
while (sigEnd < a && !/\)\s*\{\s*$/.test(lines[sigEnd])) sigEnd++;
const signature = lines.slice(head, sigEnd + 1).join('\n');
const typeMatch = signature.match(/\bvm:\s*(\w+)/);
if (!typeMatch) {
  console.error('move-block: the component takes no `vm: State` prop');
  process.exit(1);
}
const stateType = typeMatch[1];
// The parent's other props (names in its destructured parameter), passed through when the block reads them.
const paramGroup = signature.slice(signature.indexOf('(') + 1).match(/^\s*\{([^}]*)\}/);
const params = paramGroup
  ? paramGroup[1]
      .split(',')
      .map((x) => x.trim().split(/[:=]/)[0].trim())
      .filter((x) => x && x !== 'vm')
  : [];

// Names destructured from vm, and every other const/let/function declared in the component body.
const body = lines.slice(sigEnd + 1, a).join('\n');
const destructure = body.match(/const\s*\{([^}]*)\}\s*=\s*vm\b/);
if (!destructure) {
  console.error('move-block: no `const { … } = vm` in the component');
  process.exit(1);
}
const vmNames = destructure[1]
  .split(',')
  .map((s) => s.trim().split(':').pop().trim())
  .filter(Boolean);
const otherLocals = [...body.replace(destructure[0], '').matchAll(/\b(?:const|let|function)\s+([A-Za-z_$][\w$]*)/g)].map(
  (m) => m[1],
);

const block = lines.slice(a, b + 1);
const text = block.join('\n');
const reads = (n) => new RegExp(`(?<![\\w$.])${n.replace(/\$/g, '\\$')}(?![\\w$])`).test(text);
const blocked = otherLocals.filter(reads);
if (blocked.length) {
  console.error(`move-block: the block reads ${blocked.join(', ')}, declared in the component — not moved`);
  process.exit(1);
}
const used = vmNames.filter(reads);
const passed = params.filter(reads);
const propNames = ['vm', ...passed];
const propTypes = [`vm: ${stateType}`, ...passed.map((n) => `${n}: Parameters<typeof ${parent}>[0]["${n}"]`)];

// Indentation: the block's own, re-based to sit inside `return (`.
const indent = Math.min(...block.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
const rebased = block.map((l) => (l.trim() ? '    ' + l.slice(indent) : ''));
const topLevel = block.filter((l) => l.trim() && l.match(/^ */)[0].length === indent && /^\s*</.test(l)).length;
const opensAndCloses = topLevel > 1 || /^\s*\{\/\*/.test(block[0]);
const jsx = opensAndCloses ? ['    <>', ...rebased.map((l) => (l ? '  ' + l : l)), '    </>'] : rebased;

const imports = [];
for (let i = 0; i < lines.length; i++) {
  if (!/^import\s/.test(lines[i])) continue;
  let j = i;
  while (!/from\s+["'][^"']+["'];?\s*$/.test(lines[j]) && !/^import\s+["']/.test(lines[j])) j++;
  imports.push(lines.slice(i, j + 1).join('\n'));
  i = j;
}
const relTarget = path.relative(path.dirname(target), path.dirname(file)) || '.';
const fixImport = (imp) =>
  imp.replace(/from\s+["'](\.{1,2}\/[^"']+)["']/, (m, p) => {
    const resolved = path.relative(path.dirname(target), path.resolve(path.dirname(file), p));
    return `from "${resolved.startsWith('.') ? resolved : './' + resolved}"`;
  });
const directive = /^["']use client["']/.test(lines[0]) ? `${lines[0]}\n\n` : '';
// Typing a passed prop as Parameters<typeof Parent> needs the parent's name (a type-only import, no cycle at run time).
const parentImport = passed.length
  ? `\nimport type { ${parent} } from "./${path.relative(path.dirname(target), file).replace(/\.tsx?$/, '').replace(/^\.\//, '')}"`
  : '';
const out =
  directive +
  imports.map(relTarget === '.' ? (x) => x : fixImport).join('\n') +
  parentImport +
  `\n\n/** Part of the parent component's markup, moved here unchanged; it reads the state from \`vm\`. */\n` +
  `export function ${name}({ ${propNames.join(', ')} }: { ${propTypes.join('; ')} }) {\n` +
  (used.length ? `  const { ${used.join(', ')} } = vm\n` : '') +
  `  return (\n${jsx.join('\n')}\n  )\n}\n`;
fs.writeFileSync(target, out);

const importPath = './' + path.relative(path.dirname(file), target).replace(/\.tsx?$/, '');
const replaced = [...lines.slice(0, a), ' '.repeat(indent) + `<${name} ${propNames.map((n) => `${n}={${n}}`).join(' ')} />`, ...lines.slice(b + 1)];
// After the last import (the line that ends an import statement).
let insertAt = 0;
for (let i = 0; i < replaced.length; i++) if (/from\s+["'][^"']+["'];?\s*$/.test(replaced[i]) || /^import\s+["']/.test(replaced[i])) insertAt = i + 1;
replaced.splice(insertAt, 0, `import { ${name} } from "${importPath.startsWith('./.') ? importPath.slice(2) : importPath}"`);
fs.writeFileSync(file, replaced.join('\n'));
console.log(`move-block: lines ${first}-${last} → ${target} (${name}, reads ${used.length} name(s) from vm)`);
