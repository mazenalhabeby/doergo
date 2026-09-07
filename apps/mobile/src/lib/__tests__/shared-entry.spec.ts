import fs from 'fs';
import path from 'path';

/**
 * Mobile must import `@hbcfield/shared/client`, never the package root.
 *
 * The root barrel is the SERVER entry. It re-exports Node-only modules —
 * invitation-code hashing and bearer-secret helpers, both built on Node's
 * `crypto` — which React Native has no standard library for. One import of the
 * root drags the whole chain in and the bundle fails outright:
 *
 *   You attempted to import the Node standard library module "crypto"
 *   from "packages/shared/dist-esm/utils/crypto.js"
 *
 * What makes this worth a test rather than a code review note is WHERE it
 * fails. `tsc --noEmit` passes: the types are real and resolve fine. The web
 * build passes; it never touches this package entry. Nothing goes red until
 * somebody opens the iOS or Android app, which may be days later and is
 * usually a different person than the one who wrote the import.
 *
 * `/client` carries the same pure helpers — geofence maths, permissions,
 * formatting — and deliberately omits everything that needs Node.
 */

const ROOTS = ['src', 'app'];
const SOURCE = /\.(ts|tsx)$/;

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(full, out);
    } else if (SOURCE.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Code only — see the note in the root-import test. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('the shared package entry mobile uses', () => {
  const base = path.join(__dirname, '../../..');
  const files = ROOTS.flatMap((r) => walk(path.join(base, r)));

  it('finds the app source (an empty scan would pass anything)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('never imports the shared package root', () => {
    /*
      Comments are stripped before scanning, and the first version of this test
      proved why: the line below documenting the pattern contained an example of
      the very thing being looked for, so the guard reported ITSELF as the only
      offender. A scanner that reads prose finds prose.

      The pattern matches the bare package name only — a subpath such as
      '@hbcfield/shared/client' has a character after it and is the correct form.
    */
    const rootImport = /from\s+['"]@hbcfield\/shared['"]/;
    const offenders = files
      .filter((f) => rootImport.test(stripComments(fs.readFileSync(f, 'utf8'))))
      .map((f) => path.relative(base, f));

    expect(offenders).toEqual([]);
  });

  it('the client entry itself pulls in no Node builtin', () => {
    // The reason the rule above is safe to follow: /client is clean, so
    // redirecting an import there actually fixes the bundle rather than
    // moving the failure.
    const dist = path.join(base, '../../packages/shared/dist');
    const seen = new Set<string>();
    const NODE_ONLY = /require\(["'](crypto|fs|path|net|tls|child_process|os|http|https|stream|zlib)["']\)/;
    const bad: string[] = [];

    const follow = (file: string) => {
      if (seen.has(file) || !fs.existsSync(file)) return;
      seen.add(file);
      const src = fs.readFileSync(file, 'utf8');
      if (NODE_ONLY.test(src)) bad.push(path.relative(dist, file));
      for (const m of src.matchAll(/require\(["'](\.[^"']+)["']\)/g)) {
        const rel = m[1]!;
        const resolved = path.resolve(path.dirname(file), rel);
        follow(fs.existsSync(resolved + '.js') ? resolved + '.js' : path.join(resolved, 'index.js'));
      }
    };
    follow(path.join(dist, 'client.js'));

    expect({ filesWalked: seen.size > 5, nodeOnly: bad }).toEqual({ filesWalked: true, nodeOnly: [] });
  });
});
