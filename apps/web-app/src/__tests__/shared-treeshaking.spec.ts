import fs from 'fs';
import path from 'path';

/**
 * `@hbcfield/shared` must stay tree-shakeable.
 *
 * The package is consumed two ways that want opposite things. The NestJS
 * services `require()` it, so it has to keep emitting CommonJS. Webpack and
 * Metro need ES modules, because CommonJS cannot be tree-shaken at all —
 * `exports.x = ...` is a runtime assignment a bundler cannot reason about, so
 * every module a barrel re-exports has to be kept.
 *
 * That is not theoretical. `@hbcfield/shared/client` re-exports about fifteen
 * modules; importing three pricing helpers on the marketing page pulled in
 * access control, support, chat, the setup catalogue and an IANA timezone
 * table. Building ESM alongside CJS took First Load JS on `/` from 346 kB to
 * 304 kB, and `/pricing` from 316 to 271.
 *
 * Both halves are load-bearing and neither fails loudly on its own:
 *
 *   • drop `sideEffects: false` and webpack must assume every module might do
 *     work at import time, so it keeps them all — the bundle silently regrows
 *   • add a subpath export without an `import` condition and that entry point
 *     quietly falls back to CommonJS, un-shaken, while everything still builds
 *
 * So the shape of the manifest is asserted rather than trusted.
 */

const SHARED = path.join(process.cwd(), '../../packages/shared');
const pkg = JSON.parse(fs.readFileSync(path.join(SHARED, 'package.json'), 'utf8'));

describe('@hbcfield/shared stays tree-shakeable', () => {
  it('declares no import-time side effects', () => {
    // Verified by scanning src: nothing does work at module scope. If that ever
    // changes, list the offending files here instead of flipping this to true —
    // `sideEffects` accepts an array of paths.
    expect(pkg.sideEffects).toBe(false);
  });

  it('builds both module formats', () => {
    expect(pkg.scripts.build).toContain('tsc');
    expect(pkg.scripts.build).toContain('tsconfig.esm.json');
  });

  it('every subpath offering CommonJS also offers ESM, in that order', () => {
    const wrong: string[] = [];

    for (const [subpath, value] of Object.entries<Record<string, string>>(pkg.exports)) {
      if (typeof value !== 'object' || !('require' in value)) continue;

      if (!value.import) {
        wrong.push(`${subpath}: has "require" but no "import" — falls back to CommonJS`);
        continue;
      }
      if (!value.import.includes('dist-esm')) {
        wrong.push(`${subpath}: "import" points at ${value.import}, not the ESM build`);
      }
      // Node picks the first matching condition, so "types" must precede the
      // code conditions or editors resolve the wrong declarations.
      const keys = Object.keys(value);
      if (keys.includes('types') && keys.indexOf('types') !== 0) {
        wrong.push(`${subpath}: "types" must come first, got ${keys.join(', ')}`);
      }
      if (keys.indexOf('import') > keys.indexOf('require')) {
        wrong.push(`${subpath}: "import" must precede "require"`);
      }
    }

    expect(wrong).toEqual([]);
  });

  it('the ESM tsconfig targets a bundler, not Node', () => {
    // TypeScript does not rewrite relative specifiers, so this output keeps
    // extensionless imports. Webpack and Metro resolve them; Node's ESM loader
    // would not — which is why the services resolve "require" instead.
    const raw = fs.readFileSync(path.join(SHARED, 'tsconfig.esm.json'), 'utf8');
    const cfg = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ''));
    expect(cfg.compilerOptions.module).toBe('ESNext');
    expect(cfg.compilerOptions.moduleResolution).toBe('Bundler');
    expect(cfg.compilerOptions.outDir).toContain('dist-esm');
  });
});
