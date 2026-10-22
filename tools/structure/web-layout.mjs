/**
 * The web app's folder rule (docs/plans/code-structure-fix.md 5.1):
 *
 *   - a route folder holds Next's own files (page, layout, loading, error, route …) and folders —
 *     its pieces live in `_components/`, its hooks in `_hooks/`, its helpers in `_lib/`
 *     (a private `_name/` folder shared by several routes is allowed);
 *   - a route's private folders are its own: no other route, and nothing in `components/`, imports
 *     from them — a piece two routes share lives in `components/<domain>` (5.5);
 *   - `components/` holds domain folders only — no loose file at its root. A hook used by one
 *     component lives beside it in that folder; a hook used across the app lives in `hooks/`.
 *
 * Returns every file that breaks it, as a path from the repo root.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { REPO } from './files.mjs';

const SRC = 'apps/web-app/src';
const NEXT_FILES =
  /^(page|layout|loading|error|not-found|route|template|default|global-error|opengraph-image|twitter-image|icon|apple-icon|sitemap|robots|manifest)\.tsx?$/;
const CODE = /\.(ts|tsx)$/;

function routeFiles(dir, out) {
  for (const e of readdirSync(join(REPO, dir))) {
    const rel = `${dir}/${e}`;
    if (statSync(join(REPO, rel)).isDirectory()) {
      // Private folders (`_components`, `_hooks`, `_lib`, `_home` …) and tests are where pieces belong.
      if (!e.startsWith('_')) routeFiles(rel, out);
    } else if (CODE.test(e) && !NEXT_FILES.test(e)) out.push(rel);
  }
  return out;
}

function codeFiles(dir, out = []) {
  for (const e of readdirSync(join(REPO, dir))) {
    const rel = `${dir}/${e}`;
    if (statSync(join(REPO, rel)).isDirectory()) {
      if (e !== '__tests__' && e !== 'node_modules') codeFiles(rel, out);
    } else if (CODE.test(e) && !/\.(spec|test)\.tsx?$/.test(e)) out.push(rel);
  }
  return out;
}

/** The route that owns a file in a private folder (`app/x/_components/y.tsx` → `app/x`), or null. */
function owner(rel) {
  const parts = rel.slice(SRC.length + 1).split('/');
  const at = parts.findIndex((p, i) => i > 0 && parts[0] === 'app' && p.startsWith('_'));
  return at > 0 ? parts.slice(0, at).join('/') : null;
}

function resolve(from, spec) {
  const base = spec.startsWith('@/')
    ? `${SRC}/${spec.slice(2)}`
    : spec.startsWith('.')
      ? normalize(join(dirname(from), spec))
      : null;
  if (!base) return null;
  return (
    ['', '.ts', '.tsx', '/index.ts', '/index.tsx']
      .map((x) => base + x)
      .find((c) => existsSync(join(REPO, c)) && statSync(join(REPO, c)).isFile()) ?? null
  );
}

/** `importer → target` for every import of another route's private folder. */
function crossRouteImports() {
  const out = [];
  for (const file of codeFiles(SRC)) {
    const inner = file.slice(SRC.length + 1);
    for (const m of readFileSync(join(REPO, file), 'utf8').matchAll(/(?:from|import\()\s*['"]([^'"]+)['"]/g)) {
      const target = resolve(file, m[1]);
      const own = target && owner(target);
      if (own && !inner.startsWith(own + '/')) out.push(`${file} imports ${target}`);
    }
  }
  return out;
}

export function webLayoutProblems() {
  const loose = readdirSync(join(REPO, SRC, 'components'))
    .filter((e) => CODE.test(e) && !statSync(join(REPO, SRC, 'components', e)).isDirectory())
    .map((e) => `${SRC}/components/${e}`);
  return [...loose, ...routeFiles(`${SRC}/app`, []), ...crossRouteImports()].sort();
}
