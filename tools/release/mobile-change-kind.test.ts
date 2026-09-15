import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import {
  bumpPatch,
  configAssetPaths,
  configVersionLiteral,
  decide,
  dependencyChanges,
  diffPaths,
  evaluateAppConfig,
  lockChanges,
  mobileLockVersions,
  nativeByInstall,
  nativeByName,
  nativeConfigChanges,
  setConfigVersion,
  type DecideInput,
} from './mobile-change-kind.ts';

const repoRoot = join(import.meta.dirname, '..', '..');
const req = createRequire(join(repoRoot, 'apps/mobile/package.json'));
let ts: any = null;
let yaml: any = null;
try {
  ts = req('typescript');
  yaml = req('js-yaml');
} catch {
  /* node_modules not installed: the evaluation tests skip */
}

const CONFIG = (over: { version?: string; plugins?: string; perms?: string; commit?: string } = {}) => `
import { ExpoConfig, ConfigContext } from 'expo/config';
import { execSync } from 'node:child_process';
function resolveGitCommit(): string {
  const easCommit = process.env.EAS_BUILD_GIT_COMMIT_HASH;
  if (easCommit) return easCommit.slice(0, 7);
  return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
}
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'HBCField',
  // ${over.commit ?? 'a comment that changes nothing'}
  version: '${over.version ?? '1.0.6'}',
  icon: './assets/icon.png',
  android: { permissions: [${over.perms ?? "'android.permission.CAMERA'"}] },
  plugins: [${over.plugins ?? "'expo-router'"}],
  extra: { gitCommit: resolveGitCommit(), builtAt: new Date().toISOString(), buildProfile: 'x' },
});
`;

const base: DecideInput = {
  changedSinceBuild: [],
  changedSinceRelease: [],
  basePkg: { dependencies: { expo: '~54.0.35', zod: '^3.24.1' } },
  headPkg: { dependencies: { expo: '~54.0.35', zod: '^3.24.1' } },
  baseConfig: { version: '1.0.6', plugins: ['expo-router'], extra: { gitCommit: 'aaa' } },
  headConfig: { version: '1.0.6', plugins: ['expo-router'], extra: { gitCommit: 'bbb' } },
  baseLock: {},
  headLock: {},
  easBuildChanged: false,
  isNative: nativeByName,
};

// ─── The decision ───────────────────────────────────────────────────────────

test('nothing mobile changed → none', () => {
  const d = decide({ ...base, changedSinceRelease: ['apps/web-app/src/page.tsx', 'apps/mobile/README.md'] });
  assert.equal(d.kind, 'none');
});

test('JS under apps/mobile or packages/shared → ota, on the current train, no bump', () => {
  const d = decide({
    ...base,
    changedSinceBuild: ['apps/mobile/src/lib/x.ts'],
    changedSinceRelease: ['apps/mobile/src/lib/x.ts', 'packages/shared/src/y.ts'],
  });
  assert.equal(d.kind, 'ota');
  assert.equal(d.releaseVersion, '1.0.6');
  assert.equal(d.bumpRequired, false);
});

test('tests and docs alone do not make an OTA', () => {
  const d = decide({
    ...base,
    changedSinceRelease: ['apps/mobile/src/lib/__tests__/a.spec.ts', 'packages/shared/src/b.spec.ts', 'apps/mobile/EAS-SUBMIT-SETUP.md'],
  });
  assert.equal(d.kind, 'none');
});

test('a native dependency added → store, and the train is bumped', () => {
  const d = decide({ ...base, headPkg: { dependencies: { ...base.headPkg.dependencies, 'expo-sqlite': '~16.0.10' } } });
  assert.equal(d.kind, 'store');
  assert.match(d.storeReasons.join('\n'), /expo-sqlite/);
  assert.equal(d.bumpRequired, true);
  assert.equal(d.releaseVersion, '1.0.7');
});

test('a native dependency range changed → store', () => {
  const d = decide({ ...base, headPkg: { dependencies: { expo: '~55.0.0', zod: '^3.24.1' } } });
  assert.equal(d.kind, 'store');
});

test('a JS-only dependency added or bumped → ota, not store', () => {
  const d = decide({
    ...base,
    headPkg: { dependencies: { expo: '~54.0.35', zod: '^3.25.0', 'date-fns': '^4.1.0' } },
  });
  assert.equal(d.kind, 'ota');
  assert.deepEqual(d.storeReasons, []);
});

test('removing a native dependency is OTA-safe', () => {
  const d = decide({ ...base, headPkg: { dependencies: { zod: '^3.24.1' } } });
  assert.equal(d.kind, 'ota');
});

test('a native package re-resolved in the lockfile → store', () => {
  const d = decide({ ...base, baseLock: { 'expo-camera': '17.0.9' }, headLock: { 'expo-camera': '17.0.10' } });
  assert.equal(d.kind, 'store');
  assert.match(d.storeReasons[0], /expo-camera 17\.0\.9 → 17\.0\.10/);
});

test('config plugins, native assets and eas.json build profiles → store', () => {
  assert.equal(decide({ ...base, changedSinceBuild: ['apps/mobile/plugins/with-nav-app-queries.js'] }).kind, 'store');
  assert.equal(
    decide({ ...base, headConfig: { ...base.headConfig, icon: './assets/icon.png' }, baseConfig: { ...base.baseConfig, icon: './assets/icon.png' }, changedSinceBuild: ['apps/mobile/assets/icon.png'] }).kind,
    'store',
  );
  assert.equal(decide({ ...base, easBuildChanged: true }).kind, 'store');
});

test('an evaluated config that differs outside build metadata → store', () => {
  const d = decide({ ...base, headConfig: { ...base.headConfig, plugins: ['expo-router', 'expo-sqlite'] } });
  assert.equal(d.kind, 'store');
  assert.deepEqual(d.storeReasons, ['app.config.ts: plugins changed']);
});

test('a version already moved by hand is a store build on that version, never an OTA and never a double bump', () => {
  const d = decide({ ...base, headConfig: { ...base.headConfig, version: '1.1.0' }, changedSinceRelease: ['apps/mobile/src/a.ts'] });
  assert.equal(d.kind, 'store');
  assert.equal(d.bumpRequired, false);
  assert.equal(d.releaseVersion, '1.1.0');
});

test('no config at the base commit → store', () => {
  assert.deepEqual(nativeConfigChanges(null, {}), ['app.config.ts did not exist at the last store build']);
});

// ─── Pieces ─────────────────────────────────────────────────────────────────

test('diffPaths ignores what is equal and names what is not', () => {
  assert.deepEqual(diffPaths({ a: 1, b: { c: [1, 2] } }, { a: 1, b: { c: [1, 2] } }), []);
  assert.deepEqual(diffPaths({ a: 1, b: { c: [1] } }, { a: 2, b: { c: [1, 2] }, d: 0 }).sort(), ['a', 'b.c', 'd']);
});

test('nativeByName: the prefixes carry native code, the known JS packages do not', () => {
  for (const n of ['expo', 'expo-sqlite', 'react-native', 'react-native-maps', '@react-native-community/netinfo', '@sbaiahmed1/react-native-biometrics']) {
    assert.equal(nativeByName(n), true, n);
  }
  for (const n of ['zod', 'i18next', '@tanstack/react-query', '@expo/vector-icons', '@expo-google-fonts/outfit', '@hbcfield/shared']) {
    assert.equal(nativeByName(n), false, n);
  }
});

test('nativeByInstall reads the markers autolinking reads', () => {
  const root = mkdtempSync(join(tmpdir(), 'mck-'));
  const mk = (name: string, files: string[]) => {
    const dir = join(root, 'node_modules', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name }));
    for (const f of files) mkdirSync(join(dir, f), { recursive: true });
  };
  mk('js-only-lib', []);
  mk('has-ios', ['ios']);
  mk('expo-mod', ['expo-module.config.json']);
  assert.equal(nativeByInstall('js-only-lib', [root]), false);
  assert.equal(nativeByInstall('has-ios', [root]), true);
  assert.equal(nativeByInstall('expo-mod', [root]), true);
  assert.equal(nativeByInstall('not-installed', [root]), undefined);
});

test('dependencyChanges splits native from JS', () => {
  const r = dependencyChanges({ dependencies: { a: '1' } }, { dependencies: { a: '2', 'expo-x': '1' } }, nativeByName);
  assert.equal(r.store.length, 1);
  assert.equal(r.js.length, 1);
});

test('lockChanges only reports native packages that changed', () => {
  assert.deepEqual(lockChanges({ zod: '3.1', 'expo-a': '1' }, { zod: '3.2', 'expo-a': '1' }, nativeByName), []);
});

test('versions: bump, read and rewrite', () => {
  assert.equal(bumpPatch('1.0.6'), '1.0.7');
  assert.throws(() => bumpPatch('1.0'));
  const src = CONFIG({ version: '1.0.6' });
  assert.equal(configVersionLiteral(src), '1.0.6');
  const next = setConfigVersion(src, '1.0.7');
  assert.equal(configVersionLiteral(next), '1.0.7');
  assert.equal(next.replace("'1.0.7'", "'1.0.6'"), src, 'only the version line changes');
});

test('configAssetPaths finds every local file the config references', () => {
  assert.deepEqual(
    configAssetPaths({ icon: './assets/icon.png', plugins: [['expo-notifications', { icon: './assets/n.png' }], 'expo-router'] }).sort(),
    ['apps/mobile/assets/icon.png', 'apps/mobile/assets/n.png'],
  );
});

// ─── Evaluating the real file format ────────────────────────────────────────

test('evaluateAppConfig pins the moving parts so only real edits differ', { skip: !ts }, () => {
  const a = evaluateAppConfig(CONFIG({ commit: 'one comment' }), ts);
  const b = evaluateAppConfig(CONFIG({ commit: 'another comment' }), ts);
  assert.equal(a.version, '1.0.6');
  assert.deepEqual(nativeConfigChanges(a, b), [], 'comments, the git commit and the build time are not native changes');
  const c = evaluateAppConfig(CONFIG({ perms: "'android.permission.CAMERA', 'android.permission.RECORD_AUDIO'" }), ts);
  assert.deepEqual(nativeConfigChanges(a, c), ['app.config.ts: android.permissions changed']);
});

test("the repository's own app.config.ts evaluates", { skip: !ts || !existsSync(join(repoRoot, 'apps/mobile/app.config.ts')) }, () => {
  const cfg = evaluateAppConfig(readFileSync(join(repoRoot, 'apps/mobile/app.config.ts'), 'utf8'), ts);
  assert.match(cfg.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(cfg.runtimeVersion, { policy: 'appVersion' }, 'the whole OTA-train rule assumes appVersion');
  assert.ok(Array.isArray(cfg.plugins));
});

test('mobileLockVersions reads the apps/mobile importer', { skip: !yaml }, () => {
  const lock = `
lockfileVersion: '9.0'
importers:
  apps/mobile:
    dependencies:
      expo-camera:
        specifier: ~17.0.10
        version: 17.0.10(expo@54.0.35)(react@19.1.0)
      zod:
        specifier: ^3.24.1
        version: 3.25.76
  apps/web-app:
    dependencies:
      next:
        specifier: 15.0.0
        version: 15.0.0
`;
  assert.deepEqual(mobileLockVersions(lock, yaml.load), { 'expo-camera': '17.0.10', zod: '3.25.76' });
});
