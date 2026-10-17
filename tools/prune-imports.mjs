#!/usr/bin/env node
/**
 * Remove imported names TypeScript reports as unused (TS6133) in the given files.
 *   npx tsc --noEmit -p <tsconfig> --noUnusedLocals | node tools/prune-imports.mjs <file…>
 * Only import lines are touched; an unused LOCAL is left for a person to look at.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = new Set(process.argv.slice(2).map((f) => resolve(f)));
const report = readFileSync(0, 'utf8');
const unused = new Map();
for (const m of report.matchAll(/^(.+?)\((\d+),\d+\): error TS6133: '([^']+)' is declared/gm)) {
  const f = resolve(m[1]);
  if (!files.has(f)) continue;
  if (!unused.has(f)) unused.set(f, new Set());
  unused.get(f).add(m[3]);
}
for (const [f, names] of unused) {
  let s = readFileSync(f, 'utf8');
  s = s.replace(/^import (type )?\{([^}]*)\} from ('[^']+'|"[^"]+");?\n/gm, (all, type, list, spec) => {
    const parts = list
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const keep = parts.filter(
      (p) =>
        !names.has(
          p
            .replace(/^type /, '')
            .split(/\s+as\s+/)
            .pop(),
        ),
    );
    if (keep.length === parts.length) return all;
    if (!keep.length) return '';
    const one = `import ${type ?? ''}{ ${keep.join(', ')} } from ${spec};\n`;
    return one.length <= 121 ? one : `import ${type ?? ''}{\n  ${keep.join(',\n  ')},\n} from ${spec};\n`;
  });
  writeFileSync(f, s);
  console.log(`${f}: removed ${[...names].join(', ')}`);
}
