/**
 * Store build or over-the-air update? Decided from the diff, not from memory.
 *
 * An OTA ships JavaScript to binaries that already exist. It is only safe when
 * the native side those binaries carry is the native side the JavaScript
 * expects. On 2026-08-31 JS that imported a newer expo-file-system went out as
 * an OTA to an older binary and every Play Store install crashed on render.
 * This script is that lesson as a rule.
 *
 * Compared against the commit the last STORE build was made from, a store
 * build is required when any of these changed:
 *
 *   · a dependency in apps/mobile/package.json that carries native code
 *     (added, or its version range changed; removing one is OTA-safe)
 *   · the resolved version of such a dependency in pnpm-lock.yaml
 *   · the evaluated app.config.ts, outside the fields that are only build
 *     metadata (plugins, permissions, infoPlist, entitlements, version,
 *     runtimeVersion, icons, splash — anything EAS turns into native project)
 *   · an asset the config points at (icon, splash, notification icon)
 *   · apps/mobile/plugins/ (config plugins write native project files)
 *   · eas.json build profiles (their env is baked into the binary's config)
 *
 * Otherwise JS changes under apps/mobile or packages/shared → `ota`, and
 * nothing relevant → `none`.
 *
 * ⚠️ `version` is the OTA train (`runtimeVersion: appVersion`). An OTA is only
 * ever published to the version the last store build carried. If app.config.ts
 * already names a different version, no binary exists for that train and an OTA
 * would reach nobody, so the answer is `store`.
 *
 * Usage:
 *   node tools/release/mobile-change-kind.ts [--base <sha|auto>] [--head HEAD] [--since-release <ref|auto>] [--json]
 *   node tools/release/mobile-change-kind.ts set-version 1.0.7
 * `--base auto` = tag mobile-build-v<version>, else the commit that opened the
 * current version train. Writes kind / head_version / release_version /
 * bump_required / base to $GITHUB_OUTPUT when set.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

export type Kind = 'store' | 'ota' | 'none';

export interface Decision {
  kind: Kind;
  /** Why a store build is required (empty for ota/none). */
  storeReasons: string[];
  /** What changed that only needs JavaScript. */
  jsChanges: string[];
  baseVersion: string | null;
  headVersion: string | null;
  /** The version the release will carry: head's, bumped when a store build needs a new train. */
  releaseVersion: string | null;
  /** True when the workflow must write releaseVersion into app.config.ts before building. */
  bumpRequired: boolean;
}

export const MOBILE_DIR = 'apps/mobile';

/** Fields of the evaluated config that are build metadata, never native project. */
export const JS_ONLY_CONFIG_PATHS = ['extra.gitCommit', 'extra.builtAt', 'extra.buildProfile'];

/** Packages known to be JavaScript only, whatever their name suggests. */
const KNOWN_JS_ONLY = new Set([
  '@hbcfield/shared',
  '@tanstack/react-query',
  '@expo/vector-icons',
  '@expo/metro-runtime',
  '@babel/runtime',
  '@react-navigation/native',
  'i18next',
  'react-i18next',
  'socket.io-client',
  'zod',
  'react',
]);

// ─── Dependencies ───────────────────────────────────────────────────────────

/** Fallback when the package is not installed (removed, or no node_modules). */
export function nativeByName(name: string): boolean {
  if (KNOWN_JS_ONLY.has(name) || name.startsWith('@expo-google-fonts/')) return false;
  return (
    name === 'expo' ||
    name === 'react-native' ||
    name.startsWith('expo-') ||
    name.startsWith('react-native-') ||
    name.startsWith('@react-native') ||
    name.startsWith('@expo/') ||
    /(^|[/-])react-native($|-)/.test(name)
  );
}

/**
 * Does the installed package carry native code or a config plugin? Looks for
 * the markers autolinking and prebuild actually read.
 */
export function nativeByInstall(name: string, searchRoots: string[]): boolean | undefined {
  if (KNOWN_JS_ONLY.has(name)) return false;
  for (const root of searchRoots) {
    const dir = join(root, 'node_modules', name);
    if (!existsSync(join(dir, 'package.json'))) continue;
    const markers = ['ios', 'android', 'expo-module.config.json', 'app.plugin.js', 'react-native.config.js'];
    return markers.some((m) => existsSync(join(dir, m)));
  }
  return undefined;
}

export type NativeCheck = (name: string) => boolean;

export function dependencyChanges(
  basePkg: { dependencies?: Record<string, string> } | null,
  headPkg: { dependencies?: Record<string, string> },
  isNative: NativeCheck,
): { store: string[]; js: string[] } {
  const store: string[] = [];
  const js: string[] = [];
  const before = basePkg?.dependencies ?? {};
  const after = headPkg.dependencies ?? {};
  for (const [name, range] of Object.entries(after)) {
    if (!(name in before)) {
      (isNative(name) ? store : js).push(`dependency added: ${name}@${range}${isNative(name) ? ' (native)' : ''}`);
    } else if (before[name] !== range) {
      (isNative(name) ? store : js).push(`dependency changed: ${name} ${before[name]} → ${range}${isNative(name) ? ' (native)' : ''}`);
    }
  }
  for (const name of Object.keys(before)) {
    if (!(name in after)) js.push(`dependency removed: ${name} (an older binary carrying it is harmless)`);
  }
  return { store, js };
}

/** Resolved versions of apps/mobile's direct dependencies, from a pnpm lockfile. */
export function mobileLockVersions(lockText: string | null, yamlLoad: (s: string) => any): Record<string, string> {
  if (!lockText) return {};
  const doc = yamlLoad(lockText) ?? {};
  const importer = doc.importers?.[MOBILE_DIR] ?? {};
  const out: Record<string, string> = {};
  for (const section of ['dependencies', 'optionalDependencies']) {
    for (const [name, entry] of Object.entries<any>(importer[section] ?? {})) {
      const version = typeof entry === 'string' ? entry : entry?.version;
      if (version) out[name] = String(version).replace(/\(.*$/, '');
    }
  }
  return out;
}

export function lockChanges(base: Record<string, string>, head: Record<string, string>, isNative: NativeCheck): string[] {
  const out: string[] = [];
  for (const [name, version] of Object.entries(head)) {
    if (name in base && base[name] !== version && isNative(name)) {
      out.push(`lockfile resolves native ${name} ${base[name]} → ${version}`);
    }
  }
  return out;
}

// ─── app.config.ts ──────────────────────────────────────────────────────────

/**
 * Evaluate app.config.ts the way Expo would, with the non-deterministic inputs
 * pinned (git commit, build time, env) so two evaluations differ only where the
 * file does.
 */
export function evaluateAppConfig(source: string, ts: any): Record<string, any> {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  const module = { exports: {} as any };
  const fakeRequire = (id: string) => {
    if (id === 'node:child_process' || id === 'child_process') return { execSync: () => '0000000' };
    if (id === 'expo/config') return {};
    throw new Error(`app.config.ts requires ${id}; teach mobile-change-kind.ts about it`);
  };
  const fakeProcess = { env: { EAS_BUILD_GIT_COMMIT_HASH: '0000000', EAS_BUILD_PROFILE: 'production' } };
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', 'process', outputText)(fakeRequire, module, module.exports, fakeProcess);
  const factory = module.exports.default ?? module.exports;
  return typeof factory === 'function' ? factory({ config: {}, projectRoot: MOBILE_DIR, staticConfig: null }) : factory;
}

/** Dotted paths whose values differ between two plain objects. */
export function diffPaths(a: unknown, b: unknown, prefix = ''): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  const isObj = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!isObj(a) || !isObj(b)) return [prefix || '(root)'];
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  const out: string[] = [];
  for (const k of keys) {
    out.push(...diffPaths((a as any)[k], (b as any)[k], prefix ? `${prefix}.${k}` : k));
  }
  return out;
}

export function nativeConfigChanges(base: Record<string, any> | null, head: Record<string, any>): string[] {
  if (!base) return ['app.config.ts did not exist at the last store build'];
  return diffPaths(base, head)
    .filter((p) => !JS_ONLY_CONFIG_PATHS.some((ignored) => p === ignored || p.startsWith(`${ignored}.`)))
    .map((p) => `app.config.ts: ${p} changed`);
}

/** Repo paths of every local file the config references (./assets/icon.png …). */
export function configAssetPaths(config: unknown): string[] {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === 'string' && v.startsWith('./')) out.add(`${MOBILE_DIR}/${v.slice(2)}`);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(config);
  return [...out];
}

// ─── Versions ───────────────────────────────────────────────────────────────

export function bumpPatch(version: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!m) throw new Error(`version "${version}" is not x.y.z`);
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

/** Rewrite the single `version: 'x.y.z'` line of app.config.ts. */
export function setConfigVersion(source: string, version: string): string {
  const re = /^(\s*version:\s*)(['"])\d+\.\d+\.\d+\2(\s*,)/m;
  if (!re.test(source)) throw new Error('could not find a `version: \'x.y.z\',` line in app.config.ts');
  return source.replace(re, `$1$2${version}$2$3`);
}

// ─── The decision ───────────────────────────────────────────────────────────

export interface DecideInput {
  /** Files changed since the last store build. */
  changedSinceBuild: string[];
  /** Files changed since the last mobile release of any kind (build or OTA). */
  changedSinceRelease: string[];
  basePkg: { dependencies?: Record<string, string> } | null;
  headPkg: { dependencies?: Record<string, string> };
  baseConfig: Record<string, any> | null;
  headConfig: Record<string, any>;
  baseLock: Record<string, string>;
  headLock: Record<string, string>;
  easBuildChanged: boolean;
  isNative: NativeCheck;
}

const isMobileRelevant = (f: string) =>
  (f.startsWith(`${MOBILE_DIR}/`) || f.startsWith('packages/shared/')) &&
  !/\.md$/i.test(f) &&
  !/(^|\/)__tests__\//.test(f) &&
  !/\.(spec|test)\.tsx?$/.test(f);

export function decide(input: DecideInput): Decision {
  const storeReasons: string[] = [];
  const jsChanges: string[] = [];

  const deps = dependencyChanges(input.basePkg, input.headPkg, input.isNative);
  storeReasons.push(...deps.store);
  jsChanges.push(...deps.js);
  storeReasons.push(...lockChanges(input.baseLock, input.headLock, input.isNative));
  storeReasons.push(...nativeConfigChanges(input.baseConfig, input.headConfig));

  for (const f of input.changedSinceBuild) {
    if (f.startsWith(`${MOBILE_DIR}/plugins/`)) storeReasons.push(`config plugin changed: ${f}`);
  }
  const assets = new Set(configAssetPaths(input.headConfig));
  for (const f of input.changedSinceBuild) {
    if (assets.has(f)) storeReasons.push(`native asset changed: ${f}`);
  }
  if (input.easBuildChanged) storeReasons.push('eas.json build profiles changed (their env is baked into the binary)');

  const baseVersion = input.baseConfig?.version ?? null;
  const headVersion = input.headConfig.version ?? null;

  if (storeReasons.length > 0) {
    // A human may already have opened the next train; do not bump it twice.
    const bumpRequired = headVersion !== null && headVersion === baseVersion;
    return {
      kind: 'store',
      storeReasons: dedupe(storeReasons),
      jsChanges,
      baseVersion,
      headVersion,
      releaseVersion: headVersion ? (bumpRequired ? bumpPatch(headVersion) : headVersion) : null,
      bumpRequired,
    };
  }

  const relevant = input.changedSinceRelease.filter(isMobileRelevant);
  jsChanges.push(...relevant);
  return {
    kind: relevant.length > 0 || deps.js.length > 0 ? 'ota' : 'none',
    storeReasons: [],
    jsChanges: dedupe(jsChanges),
    baseVersion,
    headVersion,
    releaseVersion: headVersion,
    bumpRequired: false,
  };
}

const dedupe = (xs: string[]) => [...new Set(xs)];

// ─── CLI ────────────────────────────────────────────────────────────────────

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
}

function showAt(ref: string, path: string): string | null {
  try {
    return git(['show', `${ref}:${path}`]);
  } catch {
    return null;
  }
}

function changedFiles(from: string, to: string): string[] {
  return git(['diff', '--name-only', '--no-renames', from, to]).split('\n').filter(Boolean);
}

/** The version string literally written in app.config.ts. */
export function configVersionLiteral(source: string): string | null {
  return /^\s*version:\s*['"](\d+\.\d+\.\d+)['"]/m.exec(source)?.[1] ?? null;
}

/**
 * Where the last store build came from, when nobody said:
 *   1. the tag the mobile workflow leaves after a store build, mobile-build-v<version>
 *   2. the commit that introduced the current version line — the train was opened
 *      there, so everything native since then is at most one build too cautious.
 */
function resolveStoreBuildBase(head: string, headConfigSrc: string): string | null {
  const version = configVersionLiteral(headConfigSrc);
  if (!version) return null;
  try {
    return git(['rev-parse', '--verify', '--quiet', `refs/tags/mobile-build-v${version}^{commit}`]).trim();
  } catch {
    /* no tag */
  }
  try {
    const sha = git(['log', '-1', '--format=%H', `-S${version}`, head, '--', `${MOBILE_DIR}/app.config.ts`]).trim();
    return sha || null;
  } catch {
    return null;
  }
}

/** The most recent mobile release of either kind reachable from head. */
function resolveLastRelease(head: string): string | null {
  try {
    const tag = git(['describe', '--tags', '--abbrev=0', '--match', 'mobile-build-*', '--match', 'mobile-ota-*', head]).trim();
    return tag || null;
  } catch {
    return null;
  }
}

export function main(argv: string[]): number {
  const arg = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const head = arg('--head') ?? 'HEAD';
  const headConfigSrc = showAt(head, `${MOBILE_DIR}/app.config.ts`);
  if (!headConfigSrc) {
    console.error(`mobile-change-kind: ${MOBILE_DIR}/app.config.ts not found at ${head}`);
    return 2;
  }
  let base = arg('--base') ?? 'auto';
  if (base === 'auto') {
    const found = resolveStoreBuildBase(head, headConfigSrc);
    if (!found) {
      console.error('mobile-change-kind: cannot tell which commit the last store build came from. Pass --base <sha> (eas build:list shows gitCommitHash).');
      return 2;
    }
    base = found;
  }
  let sinceRelease = arg('--since-release') ?? 'auto';
  if (sinceRelease === 'auto') sinceRelease = resolveLastRelease(head) ?? base;
  const require = createRequire(join(process.cwd(), MOBILE_DIR, 'package.json'));
  let ts: any;
  let yaml: any;
  try {
    ts = require('typescript');
    yaml = require('js-yaml');
  } catch {
    console.error('mobile-change-kind: needs `typescript` and `js-yaml` from node_modules — run pnpm install first');
    return 2;
  }

  const baseConfigSrc = showAt(base, `${MOBILE_DIR}/app.config.ts`);
  const basePkgSrc = showAt(base, `${MOBILE_DIR}/package.json`);
  const searchRoots = [join(process.cwd(), MOBILE_DIR), process.cwd()];
  const isNative: NativeCheck = (name) => nativeByInstall(name, searchRoots) ?? nativeByName(name);
  const easAt = (ref: string) => {
    const text = showAt(ref, `${MOBILE_DIR}/eas.json`);
    try {
      return text ? JSON.stringify(JSON.parse(text).build ?? {}) : '';
    } catch {
      return text ?? '';
    }
  };

  const decision = decide({
    changedSinceBuild: changedFiles(base, head),
    changedSinceRelease: changedFiles(sinceRelease, head),
    basePkg: basePkgSrc ? JSON.parse(basePkgSrc) : null,
    headPkg: JSON.parse(showAt(head, `${MOBILE_DIR}/package.json`) ?? '{}'),
    baseConfig: baseConfigSrc ? evaluateAppConfig(baseConfigSrc, ts) : null,
    headConfig: evaluateAppConfig(headConfigSrc, ts),
    baseLock: mobileLockVersions(showAt(base, 'pnpm-lock.yaml'), yaml.load),
    headLock: mobileLockVersions(showAt(head, 'pnpm-lock.yaml'), yaml.load),
    easBuildChanged: easAt(base) !== easAt(head),
    isNative,
  });

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ base, head, ...decision }, null, 2));
  } else {
    console.log(`mobile-change-kind: ${decision.kind.toUpperCase()}  (base ${base} → ${head})`);
    console.log(`  train: last store build ${decision.baseVersion ?? '?'}, app.config.ts ${decision.headVersion ?? '?'}, release ${decision.releaseVersion ?? '?'}${decision.bumpRequired ? ' (bump)' : ''}`);
    for (const r of decision.storeReasons) console.log(`  store: ${r}`);
    for (const c of decision.jsChanges.slice(0, 40)) console.log(`  js:    ${c}`);
    if (decision.jsChanges.length > 40) console.log(`  js:    … and ${decision.jsChanges.length - 40} more`);
  }

  if (process.env.GITHUB_OUTPUT) {
    const lines = [
      `kind=${decision.kind}`,
      `head_version=${decision.headVersion ?? ''}`,
      `base_version=${decision.baseVersion ?? ''}`,
      `store_reasons=${decision.storeReasons.join('; ').replace(/[\r\n]+/g, ' ')}`,
      `release_version=${decision.releaseVersion ?? ''}`,
      `bump_required=${decision.bumpRequired}`,
      `base=${base}`,
    ];
    appendFileSync(process.env.GITHUB_OUTPUT, lines.join('\n') + '\n');
  }
  return 0;
}

if (process.argv[1]?.endsWith('mobile-change-kind.ts')) {
  const sub = process.argv[2];
  if (sub === 'set-version') {
    // node tools/release/mobile-change-kind.ts set-version 1.0.7
    const path = join(MOBILE_DIR, 'app.config.ts');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path, setConfigVersion(readFileSync(path, 'utf8'), process.argv[3]));
    console.log(`app.config.ts version → ${process.argv[3]}`);
    process.exit(0);
  }
  process.exit(main(process.argv.slice(2)));
}
