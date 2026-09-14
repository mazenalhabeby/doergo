/**
 * Every operation a phone may queue must name a route that exists.
 *
 * The registry and the controllers live in different places; a renamed route
 * would otherwise turn a whole class of offline actions into 404s — refused,
 * shown to the worker as "not accepted", for something they did correctly.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { SYNC_OPERATIONS } from '@hbcfield/shared';

const MODULES = join(__dirname, '../..');

function controllers(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : controllers(p);
    return p.endsWith('.controller.ts') ? [p] : [];
  });
}

/** "METHOD /prefix/path" for every route, with every `:param` normalised to `:`. */
function routes(): Set<string> {
  const out = new Set<string>();
  const norm = (s: string) => ('/' + s).replace(/\/+/g, '/').replace(/\/$/, '').replace(/:[A-Za-z]+/g, ':');
  for (const file of controllers(MODULES)) {
    const src = readFileSync(file, 'utf8');
    const prefix = src.match(/@Controller\(\s*'([^']*)'\s*\)/)?.[1] ?? '';
    // `@Post()` with no path is the controller's own route — a create, usually.
    for (const m of src.matchAll(/@(Get|Post|Patch|Put|Delete)\(\s*(?:'([^']*)')?\s*\)/g)) {
      out.add(`${m[1].toUpperCase()} ${norm(`${prefix}/${m[2] ?? ''}`)}`);
    }
  }
  return out;
}

describe('SYNC_OPERATIONS', () => {
  const known = routes();
  it.each(Object.entries(SYNC_OPERATIONS))('%s names an existing route', (_, route) => {
    expect(known).toContain(`${route.method} ${route.path.replace(/:[A-Za-z]+/g, ':')}`);
  });
});
