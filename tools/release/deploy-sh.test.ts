/**
 * infra/release/deploy.sh against a fake production box.
 *
 * `docker` and `curl` are replaced by scripts that keep state in a temp dir, and
 * the server checkout is a throwaway git repository. What is proven is the
 * script's CONTROL FLOW — the order it changes things in, that it refuses before
 * touching anything, and that a failure after the first change puts every
 * touched service back on its previous image and the checkout back on its
 * previous commit. Real docker behaviour is not simulated beyond that.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const here = import.meta.dirname;
const repoRoot = join(here, '..', '..');
const DEPLOY = join(repoRoot, 'infra/release/deploy.sh');
const SERVICES = ['auth-service', 'task-service', 'notification-service', 'tracking-service', 'api-gateway', 'web-app'];

const g = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();

interface Box {
  dir: string;
  server: string;
  state: string;
  prevHead: string;
  target: string;
  bundle: string;
}

function makeBox(): Box {
  const dir = mkdtempSync(join(tmpdir(), 'release-'));
  const server = join(dir, 'server');
  const state = join(dir, 'state');
  const bin = join(dir, 'bin');
  mkdirSync(join(server, 'infra/docker'), { recursive: true });
  mkdirSync(join(server, 'apps/api/auth-service/prisma/migrations/0_init'), { recursive: true });
  mkdirSync(state, { recursive: true });
  mkdirSync(bin, { recursive: true });

  writeFileSync(join(server, 'apps/api/auth-service/prisma/migrations/0_init/migration.sql'), 'CREATE TABLE a (id text);\n');
  writeFileSync(join(server, 'infra/sync-static.sh'), '#!/usr/bin/env bash\necho "synced (fake)"\n');
  chmodSync(join(server, 'infra/sync-static.sh'), 0o755);
  writeFileSync(join(server, 'infra/docker/docker-compose.yml'), 'services: {}\n');
  g(server, 'init', '-q', '-b', 'main');
  g(server, 'remote', 'add', 'origin', 'git@github.com:Owner/doergo.git');
  g(server, 'add', '-A');
  g(server, 'commit', '-qm', 'A');
  // Untracked, exactly like production.
  writeFileSync(join(server, 'infra/docker/.env.production'), 'POSTGRES_USER=doergo\nPOSTGRES_DB=doergo\nPOSTGRES_PASSWORD=x\nDOMAIN=hbcfield.test\n');
  const prevHead = g(server, 'rev-parse', 'HEAD');

  // CI's side: a clone with the release commit, shipped as a bundle.
  const ci = join(dir, 'ci');
  g(dir, 'clone', '-q', server, ci);
  mkdirSync(join(ci, 'apps/api/auth-service/prisma/migrations/20260917_add'), { recursive: true });
  writeFileSync(join(ci, 'apps/api/auth-service/prisma/migrations/20260917_add/migration.sql'), 'ALTER TABLE a ADD COLUMN IF NOT EXISTS b text;\n');
  g(ci, 'add', '-A');
  g(ci, 'commit', '-qm', 'B');
  const target = g(ci, 'rev-parse', 'HEAD');
  g(ci, 'branch', 'release', target);
  const bundle = join(dir, 'release.bundle');
  g(ci, 'bundle', 'create', bundle, 'release', `^${prevHead}`);

  copyFileSync(join(here, 'fixtures/fake-docker.sh'), join(bin, 'docker'));
  copyFileSync(join(here, 'fixtures/fake-curl.sh'), join(bin, 'curl'));
  chmodSync(join(bin, 'docker'), 0o755);
  chmodSync(join(bin, 'curl'), 0o755);

  // The release currently running: every service on an "old" image.
  mkdirSync(join(state, 'containers'), { recursive: true });
  for (const s of SERVICES) writeFileSync(join(state, 'containers', `hbcfield-${s}`), `sha256:old-${s}-0000000000000000\n`);
  return { dir, server, state, prevHead, target, bundle };
}

function run(box: Box, extraEnv: Record<string, string> = {}, args: string[] = []) {
  const res = spawnSync('bash', [DEPLOY, box.target, '--bundle', box.bundle, '--expect-head', box.prevHead, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(box.dir, 'bin')}:${process.env.PATH}`,
      ROOT_DIR: box.server,
      RELEASE_DIR: join(box.dir, 'releases'),
      BACKUP_DIR: join(box.dir, 'backups'),
      TMPDIR: box.dir,
      FAKE_STATE: box.state,
      MIN_FREE_GB: '0',
      MIN_AVAILABLE_MB: '0',
      HEALTH_TIMEOUT: '5',
      REQUIRED_ENV_FILE: join(repoRoot, 'infra/release/required-env.conf'),
      HOOKS_DIR: join(repoRoot, 'infra/release/preflight.d'),
      ...extraEnv,
    },
    timeout: 120_000,
  });
  const out = `${res.stdout}\n${res.stderr}`;
  if (process.env.RELEASE_TEST_VERBOSE) console.log(out);
  return { code: res.status, out };
}

const running = (box: Box, s: string) => readFileSync(join(box.state, 'containers', `hbcfield-${s}`), 'utf8').trim();
const ups = (box: Box) => (existsSync(join(box.state, 'ups.log')) ? readFileSync(join(box.state, 'ups.log'), 'utf8').trim().split('\n') : []);
const head = (box: Box) => g(box.server, 'rev-parse', 'HEAD');
const backups = (box: Box) => (existsSync(join(box.dir, 'backups')) ? readdirSync(join(box.dir, 'backups')) : []);

test('a good release: backup, then services one at a time in order, then smoke, and it says so', () => {
  const box = makeBox();
  const { code, out } = run(box);
  assert.equal(code, 0, out);
  assert.match(out, /RESULT: released/);
  assert.equal(head(box), box.target);
  for (const s of SERVICES) assert.match(running(box, s), /^sha256:new-/, s);
  assert.deepEqual(ups(box).map((l) => l.split(' ')[1]), SERVICES, 'started one at a time, in dependency order');
  assert.equal(backups(box).length, 1);
  assert.match(out, /backup .* 2 tables, live 2/);
  assert.match(out, /api-gateway environment: \d+ required variables present/);
  assert.match(out, /migration lock free/);
  // Every line the script itself writes carries a timestamp, and the log file has it all.
  const logs = readdirSync(join(box.dir, 'releases')).filter((f) => f.endsWith('.log'));
  assert.equal(logs.length, 1);
  assert.match(readFileSync(join(box.dir, 'releases', logs[0]), 'utf8'), /\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ {2}── Smoke tests/);
  // The registry was derived from the GitHub remote, lower-cased.
  assert.match(out, /→ ghcr\.io\/owner/);
});

test('an unhealthy service rolls back everything touched, and the checkout, and leaves the rest alone', () => {
  const box = makeBox();
  const { code, out } = run(box, { FAKE_UNHEALTHY: 'api-gateway' });
  assert.equal(code, 10, out);
  assert.match(out, /RESULT: rolled-back/);
  assert.equal(head(box), box.prevHead, 'checkout back on the previous commit');
  for (const s of SERVICES) assert.match(running(box, s), /^sha256:old-/, `${s} back on its previous image`);
  assert.ok(!ups(box).some((l) => l.startsWith('UP web-app sha256:new-')), 'web-app was never started on the new image');
  assert.equal(backups(box).length, 1, 'the backup is kept as the restore point');
});

test('a failed `compose up` rolls back', () => {
  const box = makeBox();
  const { code, out } = run(box, { FAKE_UP_FAIL: 'task-service' });
  assert.equal(code, 10, out);
  assert.match(running(box, 'auth-service'), /^sha256:old-/);
});

test('a missing secret (the override not merged) rolls back', () => {
  const box = makeBox();
  const { code, out } = run(box, { FAKE_MISSING_ENV: 'GOOGLE_PLACES_API_KEY' });
  assert.equal(code, 10, out);
  assert.match(out, /api-gateway is missing: GOOGLE_PLACES_API_KEY/);
  assert.doesNotMatch(out, /GOOGLE_PLACES_API_KEY=/, 'names only, never values');
});

test('metrics answering 404 (METRICS_TOKEN unset) fails the smoke test and rolls back', () => {
  const box = makeBox();
  const { code, out } = run(box, { FAKE_METRICS_CODE: '404' });
  assert.equal(code, 10, out);
  assert.match(out, /smoke FAIL {2}GET \/sync\/metrics without a token → 404/);
  assert.equal(head(box), box.prevHead);
});

test('an image that cannot be pulled refuses before the backup and before any change', () => {
  const box = makeBox();
  const { code, out } = run(box, { FAKE_PULL_FAIL: '1' });
  assert.equal(code, 1, out);
  assert.match(out, /RESULT: refused/);
  assert.deepEqual(ups(box), []);
  assert.deepEqual(backups(box), []);
  assert.equal(head(box), box.prevHead);
});

test('a backup with fewer tables than the live database refuses the release', () => {
  const box = makeBox();
  const { code, out } = run(box, { FAKE_LIVE_TABLES: '107' });
  assert.equal(code, 1, out);
  assert.match(out, /backup has 2 tables, the live database has 107/);
  assert.deepEqual(ups(box), []);
});

test('an auth image missing a migration the commit has refuses the release', () => {
  const box = makeBox();
  const { code, out } = run(box, { FAKE_IMAGE_MIGRATIONS: '1' });
  assert.equal(code, 1, out);
  assert.match(out, /auth-service image has 1 migrations, commit has 2/);
});

test('a modified tracked file on the server refuses the release', () => {
  const box = makeBox();
  writeFileSync(join(box.server, 'infra/sync-static.sh'), '#!/usr/bin/env bash\necho edited on the box\n');
  const { code, out } = run(box);
  assert.equal(code, 1, out);
  assert.match(out, /tracked files are modified on the server/);
});

test('a server HEAD other than the one the caller saw refuses the release', () => {
  const box = makeBox();
  const { code, out } = run(box, {}, ['--expect-head', 'deadbeefdeadbeef']);
  assert.equal(code, 1, out);
  assert.match(out, /the caller expected/);
});

test('a server carrying a commit the release does not contain refuses (merge by hand, never reset)', () => {
  const box = makeBox();
  writeFileSync(join(box.server, 'hotfix.txt'), 'made on the server\n');
  g(box.server, 'add', 'hotfix.txt');
  g(box.server, 'commit', '-qm', 'hotfix on the box');
  const serverHead = head(box);
  const res = spawnSync('bash', [DEPLOY, box.target, '--bundle', box.bundle], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${join(box.dir, 'bin')}:${process.env.PATH}`, ROOT_DIR: box.server, RELEASE_DIR: join(box.dir, 'releases'), BACKUP_DIR: join(box.dir, 'backups'), TMPDIR: box.dir, FAKE_STATE: box.state, MIN_FREE_GB: '0', MIN_AVAILABLE_MB: '0' },
  });
  assert.equal(res.status, 1, res.stdout);
  assert.match(res.stdout, /does not contain the server's HEAD/);
  assert.equal(head(box), serverHead, 'the local commit is untouched');
});

test('--check runs every preflight and pulls, then stops without a backup or a change', () => {
  const box = makeBox();
  const { code, out } = run(box, {}, ['--check']);
  assert.equal(code, 0, out);
  assert.match(out, /RESULT: checked/);
  assert.deepEqual(ups(box), []);
  assert.deepEqual(backups(box), []);
  assert.equal(head(box), box.prevHead);
});

