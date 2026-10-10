/**
 * Every path parameter is ENCODED, through one builder.
 *
 * An id with `/`, `?`, `#` or `..` in it — from a deep link, a push payload or
 * a server answer — used to become a different endpoint.
 */
import * as fs from 'fs';
import * as path from 'path';
import { path as apiPath } from '../api/path';

describe('path`…`', () => {
  it('encodes each value as one segment', () => {
    expect(apiPath`/tasks/${'t1'}/crew/${'join'}`).toBe('/tasks/t1/crew/join');
    expect(apiPath`/tasks/${'../users/me'}`).toBe('/tasks/..%2Fusers%2Fme');
    expect(apiPath`/documents/${'x?y=1#z'}/sign`).toBe('/documents/x%3Fy%3D1%23z/sign');
    expect(apiPath`/a/${42}`).toBe('/a/42');
    expect(apiPath`/plain`).toBe('/plain');
  });
});

describe('no request path in src/lib/api is interpolated by hand', () => {
  const DIR = path.resolve(__dirname, '../api');
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.ts') && !['path.ts', 'client.ts'].includes(f));
  it.each(files)('%s', (f) => {
    const src = fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // A template literal that starts like a path and interpolates — unless it is tagged `path`.
    const raw = [...src.matchAll(/(\w*)`(\/[^`]*\$\{[^`]*)`/g)].filter((m) => m[1] !== 'path').map((m) => m[0]);
    expect(raw).toEqual([]);
  });
});
