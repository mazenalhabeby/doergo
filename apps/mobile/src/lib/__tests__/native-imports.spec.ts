/**
 * Native libraries newer than the oldest installed store build are never
 * imported at module scope.
 *
 * An over-the-air update reaches every install of a version, and a library that
 * binds its native module on evaluation throws in a binary built before it was
 * added. At module scope in the sign-in graph that is the app dying on launch
 * for everybody on the older build — which happened twice (biometrics, OCR).
 *
 * Load them through the loaders named below, which ask first and `require`
 * second.
 */
import * as fs from 'fs';
import * as path from 'path';

const MOBILE = path.resolve(__dirname, '../../..');

/** Library → the only files allowed to load it. */
const LOADED_ONLY_BY: Record<string, string[]> = {
  'expo-local-authentication': ['src/lib/optional-native.ts'],
  'expo-crypto': ['src/lib/optional-native.ts'],
  '@sbaiahmed1/react-native-biometrics': ['src/lib/biometrics/native.ts'],
  'expo-sqlite': ['src/offline/native.ts'],
  '@react-native-community/netinfo': ['src/offline/native.ts'],
  'expo-image-manipulator': ['src/offline/native.ts'],
  'expo-background-task': ['src/offline/native.ts'],
  'expo-mlkit-ocr': ['src/lib/ocr.ts'],
  'expo-in-app-updates': ['src/lib/in-app-updates.ts'],
};

function* walk(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'node_modules') yield* walk(full);
    } else if (/\.(tsx?|jsx?)$/.test(e.name) && !/\.(spec|test)\./.test(e.name)) yield full;
  }
}

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('late native libraries', () => {
  it('are loaded only through their loaders, never imported', () => {
    const offenders: string[] = [];
    for (const root of ['app', 'src']) {
      for (const file of walk(path.join(MOBILE, root))) {
        const rel = path.relative(MOBILE, file);
        const src = stripComments(fs.readFileSync(file, 'utf8'));
        for (const [lib, allowed] of Object.entries(LOADED_ONLY_BY)) {
          const q = lib.replace(/[/.]/g, (c) => `\\${c}`);
          // A value import or a require. `import type` and `typeof import()` erase at build time.
          const valueImport = new RegExp(`^\\s*import\\s+(?!type\\b)[^;]*?from\\s+['"]${q}['"]`, 'm').test(src);
          const bareImport = new RegExp(`^\\s*import\\s+['"]${q}['"]`, 'm').test(src);
          const required = new RegExp(`require\\(\\s*['"]${q}['"]\\s*\\)`).test(src);
          if (valueImport || bareImport) offenders.push(`${rel} imports ${lib}`);
          else if (required && !allowed.includes(rel)) offenders.push(`${rel} requires ${lib} outside its loader`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
