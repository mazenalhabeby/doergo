/**
 * The image build invariants, checked in CI before anything is built.
 *
 * Three lists describe the same web build and have drifted before:
 *   · infra/docker/docker-compose.yml   web-app.build.args     (the hand build)
 *   · apps/web-app/Dockerfile           ARG + ENV              (what reaches `next build`)
 *   · .github/workflows/images.yml      build-args             (the CI build)
 * Docker drops an undeclared ARG without a word, so a variable passed but not
 * declared is configured, paid for and never used. That happened with the map
 * tiles. This refuses the drift instead.
 *
 * Also checked:
 *   · every Dockerfile shipped by the pipeline installs AND `pnpm deploy`s with
 *     --frozen-lockfile (the deploy line re-resolves without it — every image
 *     before 2026-09-09 was built unpinned)
 *   · the images workflow builds exactly the services the release deploys, with
 *     the Dockerfile compose names for each
 *   · compose names each of them `image: …hbcfield-<svc>:${HBCFIELD_TAG…}` so
 *     the server can run a CI image by tag
 *
 * Usage: node tools/release/check-images.ts   (from the repo root; needs js-yaml)
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

export const RELEASE_SERVICES = [
  'auth-service',
  'task-service',
  'notification-service',
  'tracking-service',
  'api-gateway',
  'web-app',
] as const;

export interface Problem {
  where: string;
  message: string;
}

/** `- NAME=value` or `NAME: value` build args, as compose allows both. */
export function composeArgNames(args: unknown): string[] {
  if (Array.isArray(args)) return args.map((a) => String(a).split('=')[0].trim());
  if (args && typeof args === 'object') return Object.keys(args);
  return [];
}

export function dockerfileArgs(dockerfile: string): { args: Set<string>; envs: Set<string> } {
  const args = new Set<string>();
  const envs = new Set<string>();
  for (const raw of dockerfile.split('\n')) {
    const line = raw.trim();
    let m: RegExpExecArray | null;
    if ((m = /^ARG\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(line))) args.add(m[1]);
    if ((m = /^ENV\s+([A-Za-z_][A-Za-z0-9_]*)=\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?\s*$/.exec(line)) && m[1] === m[2]) envs.add(m[1]);
  }
  return { args, envs };
}

/** Names in a build-push-action `build-args` block (one NAME=value per line). */
export function workflowArgNames(block: string): string[] {
  return block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('=')[0].trim());
}

export function frozenLockfileProblems(dockerfile: string, where: string): Problem[] {
  const problems: Problem[] = [];
  // Join continuation lines so `RUN pnpm install \` + `--frozen-lockfile` counts.
  const logical = dockerfile.replace(/\\\r?\n/g, ' ').split('\n');
  for (const line of logical) {
    if (!/^\s*RUN\b/.test(line)) continue;
    for (const cmd of line.split(/&&|;/)) {
      const isInstall = /\bpnpm\s+(?:[^|]*\s)?install\b/.test(cmd) || /\bpnpm\s+i\b/.test(cmd);
      const isDeploy = /\bpnpm\s+(?:--filter\s+\S+\s+)?deploy\b/.test(cmd);
      if ((isInstall || isDeploy) && !/--frozen-lockfile\b/.test(cmd)) {
        problems.push({ where, message: `\`${cmd.trim()}\` without --frozen-lockfile — the image would not be the lockfile` });
      }
    }
  }
  return problems;
}

export interface Inputs {
  compose: any;
  workflow: any;
  readFile: (path: string) => string;
}

export function checkImages({ compose, workflow, readFile }: Inputs): Problem[] {
  const problems: Problem[] = [];
  const services = compose?.services ?? {};

  // ── compose: image names by tag ──
  for (const svc of RELEASE_SERVICES) {
    const def = services[svc];
    if (!def) { problems.push({ where: 'docker-compose.yml', message: `service ${svc} is missing` }); continue; }
    const image = String(def.image ?? '');
    if (!image.includes(`hbcfield-${svc}:`) || !image.includes('HBCFIELD_TAG')) {
      problems.push({ where: 'docker-compose.yml', message: `${svc} needs image: \${HBCFIELD_REGISTRY:-hbcfield}/hbcfield-${svc}:\${HBCFIELD_TAG:-local} (has "${image}")` });
    }
    if (!def.build?.dockerfile) problems.push({ where: 'docker-compose.yml', message: `${svc} lost its build: section — the hand build needs it` });
  }

  // ── the workflow builds what the release deploys, from the same Dockerfiles ──
  const jobs = workflow?.jobs ?? {};
  const built = new Map<string, string>();
  for (const job of Object.values<any>(jobs)) {
    for (const inc of job?.strategy?.matrix?.include ?? []) {
      if (inc.service && inc.dockerfile) built.set(inc.service, inc.dockerfile);
    }
  }
  const webStep = (jobs['web-app']?.steps ?? []).find((s: any) => String(s?.uses ?? '').startsWith('docker/build-push-action'));
  if (webStep?.with?.file) built.set('web-app', webStep.with.file);
  for (const svc of RELEASE_SERVICES) {
    const composeFile = services[svc]?.build?.dockerfile;
    const wfFile = built.get(svc);
    if (!wfFile) problems.push({ where: 'images.yml', message: `does not build ${svc}` });
    else if (composeFile && wfFile !== composeFile) problems.push({ where: 'images.yml', message: `${svc} builds ${wfFile}, compose uses ${composeFile}` });
  }
  for (const svc of built.keys()) {
    if (!(RELEASE_SERVICES as readonly string[]).includes(svc)) {
      problems.push({ where: 'images.yml', message: `builds ${svc}, which infra/release/deploy.sh never deploys` });
    }
  }

  // ── web build args: compose ⊆ Dockerfile ARG+ENV, compose = workflow ──
  const webDockerfilePath = services['web-app']?.build?.dockerfile;
  if (webDockerfilePath) {
    const composeArgs = composeArgNames(services['web-app']?.build?.args);
    const { args, envs } = dockerfileArgs(readFile(webDockerfilePath));
    for (const name of composeArgs) {
      if (!args.has(name)) problems.push({ where: webDockerfilePath, message: `compose passes ${name} but the Dockerfile has no ARG ${name} — Docker drops it silently` });
      else if (name.startsWith('NEXT_PUBLIC_') && !envs.has(name)) problems.push({ where: webDockerfilePath, message: `ARG ${name} is never exported (ENV ${name}=$${name}) — next build cannot see it` });
    }
    const wfArgs = workflowArgNames(String(webStep?.with?.['build-args'] ?? ''));
    for (const name of composeArgs) {
      if (!wfArgs.includes(name)) problems.push({ where: 'images.yml', message: `web-app build-args is missing ${name}, which compose passes` });
    }
    for (const name of wfArgs) {
      if (!composeArgs.includes(name)) problems.push({ where: 'images.yml', message: `web-app build-args passes ${name}, which compose does not — the two builds would differ` });
      if (!args.has(name)) problems.push({ where: 'images.yml', message: `passes ${name}, which ${webDockerfilePath} does not declare` });
    }
  }

  // ── every shipped Dockerfile is pinned to the lockfile ──
  for (const svc of RELEASE_SERVICES) {
    const path = services[svc]?.build?.dockerfile;
    if (path) problems.push(...frozenLockfileProblems(readFile(path), path));
  }
  return problems;
}

export function main(root = process.cwd()): number {
  const require = createRequire(join(root, 'package.json'));
  let yaml: any;
  try {
    yaml = require('js-yaml');
  } catch {
    console.error('check-images: needs js-yaml from node_modules — run pnpm install first');
    return 2;
  }
  const read = (p: string) => readFileSync(join(root, p), 'utf8');
  const compose = yaml.load(read('infra/docker/docker-compose.yml'));
  const workflow = yaml.load(read('.github/workflows/images.yml'));
  const problems = checkImages({ compose, workflow, readFile: read });
  for (const p of problems) {
    console.log(process.env.GITHUB_ACTIONS === 'true' ? `::error file=${p.where}::${p.message}` : `  ${p.where}: ${p.message}`);
  }
  console.log(problems.length ? `check-images: ${problems.length} problem(s)` : 'check-images: OK');
  return problems.length ? 1 : 0;
}

if (process.argv[1]?.endsWith('check-images.ts')) process.exit(main());
