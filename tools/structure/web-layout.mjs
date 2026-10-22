/**
 * The web app's folder rule (docs/plans/code-structure-fix.md 5.1):
 *
 *   - a route folder holds Next's own files (page, layout, loading, error, route …) and folders —
 *     its pieces live in `_components/`, its hooks in `_hooks/`, its helpers in `_lib/`
 *     (a private `_name/` folder shared by several routes is allowed);
 *   - `components/` holds domain folders only — no loose file at its root. A hook used by one
 *     component lives beside it in that folder; a hook used across the app lives in `hooks/`.
 *
 * Returns every file that breaks it, as a path from the repo root.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
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

export function webLayoutProblems() {
  const loose = readdirSync(join(REPO, SRC, 'components'))
    .filter((e) => CODE.test(e) && !statSync(join(REPO, SRC, 'components', e)).isDirectory())
    .map((e) => `${SRC}/components/${e}`);
  return [...loose, ...routeFiles(`${SRC}/app`, [])].sort();
}
