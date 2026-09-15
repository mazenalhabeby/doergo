import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { checkImages, composeArgNames, dockerfileArgs, frozenLockfileProblems, main, workflowArgNames } from './check-images.ts';

const repoRoot = join(import.meta.dirname, '..', '..');
let yaml: any = null;
try {
  yaml = createRequire(join(repoRoot, 'package.json'))('js-yaml');
} catch {
  /* not installed */
}

test('this repository passes', { skip: !yaml }, () => {
  assert.equal(main(repoRoot), 0);
});

const read = (p: string) => readFileSync(join(repoRoot, p), 'utf8');
const load = () => ({
  compose: yaml.load(read('infra/docker/docker-compose.yml')),
  workflow: yaml.load(read('.github/workflows/images.yml')),
});

test('a compose build arg the Dockerfile never declares is caught — the map-tile bug', { skip: !yaml }, () => {
  const { compose, workflow } = load();
  const dockerfile = read('apps/web-app/Dockerfile').replace(/^ARG NEXT_PUBLIC_MAP_TILE_URL\n/m, '');
  const problems = checkImages({
    compose,
    workflow,
    readFile: (p) => (p === 'apps/web-app/Dockerfile' ? dockerfile : read(p)),
  });
  assert.ok(problems.some((p) => /no ARG NEXT_PUBLIC_MAP_TILE_URL/.test(p.message)), JSON.stringify(problems));
});

test('an ARG declared but never exported as ENV is caught', { skip: !yaml }, () => {
  const { compose, workflow } = load();
  const dockerfile = read('apps/web-app/Dockerfile').replace(/^ENV NEXT_PUBLIC_AUTH_URL=.*\n/m, '');
  const problems = checkImages({ compose, workflow, readFile: (p) => (p === 'apps/web-app/Dockerfile' ? dockerfile : read(p)) });
  assert.ok(problems.some((p) => /never exported .*NEXT_PUBLIC_AUTH_URL/.test(p.message)));
});

test('the CI build missing an arg compose passes is caught, and so is an extra one', { skip: !yaml }, () => {
  const { compose, workflow } = load();
  const step = workflow.jobs['web-app'].steps.find((s: any) => String(s.uses ?? '').startsWith('docker/build-push-action'));
  step.with['build-args'] = String(step.with['build-args']).replace(/^NEXT_PUBLIC_SOCKET_URL=.*$/m, 'NEXT_PUBLIC_SOMETHING_ELSE=x');
  const messages = checkImages({ compose, workflow, readFile: read }).map((p) => p.message).join('\n');
  assert.match(messages, /missing NEXT_PUBLIC_SOCKET_URL/);
  assert.match(messages, /passes NEXT_PUBLIC_SOMETHING_ELSE, which compose does not/);
});

test('a service the release deploys but CI does not build is caught', { skip: !yaml }, () => {
  const { compose, workflow } = load();
  const job = Object.values<any>(workflow.jobs).find((j) => j?.strategy?.matrix?.include);
  job.strategy.matrix.include = job.strategy.matrix.include.filter((i: any) => i.service !== 'tracking-service');
  assert.ok(checkImages({ compose, workflow, readFile: read }).some((p) => p.message === 'does not build tracking-service'));
});

test('compose without an image tag for a service is caught', { skip: !yaml }, () => {
  const { compose, workflow } = load();
  delete compose.services['task-service'].image;
  assert.ok(checkImages({ compose, workflow, readFile: read }).some((p) => /task-service needs image:/.test(p.message)));
});

test('frozenLockfileProblems: the deploy line needs the flag too', () => {
  const ok = `RUN pnpm install --frozen-lockfile --prod=false\nRUN pnpm --filter @hbcfield/x deploy --prod --frozen-lockfile /prod\nRUN corepack prepare pnpm@9.15.0 --activate`;
  assert.deepEqual(frozenLockfileProblems(ok, 'D'), []);
  const bad = `RUN pnpm install --prod=false\nRUN pnpm --filter @hbcfield/x deploy --prod /prod`;
  assert.equal(frozenLockfileProblems(bad, 'D').length, 2);
  const continued = `RUN pnpm install \\\n    --frozen-lockfile`;
  assert.deepEqual(frozenLockfileProblems(continued, 'D'), []);
});

test('parsers', () => {
  assert.deepEqual(composeArgNames(['A=1', 'B=${X:-}']), ['A', 'B']);
  assert.deepEqual(composeArgNames({ A: '1' }), ['A']);
  const { args, envs } = dockerfileArgs('ARG A\nARG B=2\nENV A=$A\nENV B=${B}\nENV C=literal');
  assert.deepEqual([...args], ['A', 'B']);
  assert.deepEqual([...envs], ['A', 'B']);
  assert.deepEqual(workflowArgNames('A=1\n# c\n\nB=https://x=y\n'), ['A', 'B']);
});
