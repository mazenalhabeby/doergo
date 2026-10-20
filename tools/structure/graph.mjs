/**
 * A small import graph of the repo's own files — enough to find import loops and to walk what a
 * package entry pulls in. No TypeScript compiler: imports are read with a regex, relative paths
 * (and the web app's `@/` alias) are resolved, and `import type` / `export type` are marked as
 * type-only because they are erased at build time.
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { REPO, sourceFiles } from './files.mjs';

const IMPORT_RE =
  /(?:^|[;\n])\s*(import|export)\s+(type\s+)?(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]|\b(?:require|import)\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Where `@/x` points, per app. */
const ALIASES = [
  ['apps/web-app/', 'apps/web-app/src/'],
  ['apps/admin/', 'apps/admin/src/'],
  ['apps/mobile/', 'apps/mobile/src/'],
];

function resolveFile(base) {
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const p = base + ext;
    if (existsSync(join(REPO, p)) && statSync(join(REPO, p)).isFile() && /\.tsx?$/.test(p)) return p;
  }
  return null;
}

export function resolveSpec(from, spec) {
  if (spec.startsWith('.')) return resolveFile(relative(REPO, join(REPO, dirname(from), spec)));
  if (spec.startsWith('@/')) {
    const hit = ALIASES.find(([app]) => from.startsWith(app));
    return hit ? resolveFile(hit[1] + spec.slice(2)) : null;
  }
  return null;
}

/** Strip comments so an example import inside a doc comment is not read as code. */
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** file → [{ to, bare, typeOnly }] for every import of the file. */
export function readImports(file) {
  const text = code(readFileSync(join(REPO, file), 'utf8'));
  const out = [];
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[3] ?? m[4];
    if (!spec) continue;
    const typeOnly = !!m[2];
    const to = resolveSpec(file, spec);
    out.push({ spec, to, typeOnly, bare: !to && !spec.startsWith('.') && !spec.startsWith('@/') });
  }
  return out;
}

let graphCache = null;

/** The value-import graph (type-only edges left out: they never load at runtime). */
export function valueGraph() {
  if (graphCache) return graphCache;
  const g = new Map();
  for (const f of sourceFiles())
    g.set(
      f,
      readImports(f)
        .filter((i) => i.to && !i.typeOnly)
        .map((i) => i.to),
    );
  graphCache = g;
  return g;
}

/** Strongly connected components with more than one file (Tarjan), each sorted. */
export function cycles(graph = valueGraph()) {
  let index = 0;
  const idx = new Map();
  const low = new Map();
  const stack = [];
  const on = new Set();
  const out = [];
  const strong = (v) => {
    // iterative DFS to stay clear of the call-stack limit on long chains
    const work = [[v, 0]];
    idx.set(v, index);
    low.set(v, index++);
    stack.push(v);
    on.add(v);
    while (work.length) {
      const top = work[work.length - 1];
      const [node, i] = top;
      const next = graph.get(node) ?? [];
      if (i < next.length) {
        top[1]++;
        const w = next[i];
        if (!graph.has(w)) continue;
        if (!idx.has(w)) {
          idx.set(w, index);
          low.set(w, index++);
          stack.push(w);
          on.add(w);
          work.push([w, 0]);
        } else if (on.has(w)) low.set(node, Math.min(low.get(node), idx.get(w)));
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1][0];
        low.set(parent, Math.min(low.get(parent), low.get(node)));
      }
      if (low.get(node) === idx.get(node)) {
        const comp = [];
        let w;
        do {
          w = stack.pop();
          on.delete(w);
          comp.push(w);
        } while (w !== node);
        if (comp.length > 1) out.push(comp.sort());
      }
    }
  };
  for (const v of graph.keys()) if (!idx.has(v)) strong(v);
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}
