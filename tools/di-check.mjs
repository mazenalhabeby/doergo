#!/usr/bin/env node
/**
 * Does a service's Nest module tree still wire up? Compiles the service into a temporary folder and
 * creates its application context once — every provider resolved, nothing listening — then closes.
 * Catches a missing provider, a module that forgot an import, or a circular import that leaves a
 * class undefined, without touching the running dev server.
 *
 *   node tools/di-check.mjs task-service
 *
 * ⚠️ Module init hooks run (against the service's own .env), as on a normal start; nothing is served.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const service = process.argv[2];
if (!service) throw new Error('usage: node tools/di-check.mjs <service folder under apps/api>');
const root = new URL('..', import.meta.url).pathname;
const dir = join(root, 'apps/api', service);
const out = mkdtempSync(join(tmpdir(), `di-${service}-`));
try {
  execFileSync('npx', ['tsc', '-p', 'tsconfig.json', '--outDir', out, '--incremental', 'false', '--noEmit', 'false'], {
    cwd: dir,
    stdio: 'inherit',
  });
  const script = `
    require('reflect-metadata');
    setTimeout(() => { console.error('DI check timed out'); process.exit(2); }, 90000).unref();
    const { NestFactory } = require('@nestjs/core');
    const { AppModule } = require(${JSON.stringify(join(out, 'app.module'))});
    NestFactory.createApplicationContext(AppModule, { logger: ['error'] })
      .then(async (app) => { console.log('DI OK: ${service} — every provider resolved'); await app.close(); process.exit(0); })
      .catch((e) => { console.error('DI FAILED (${service}):', e.message); process.exit(1); });`;
  execFileSync('node', ['-e', script], {
    cwd: dir,
    stdio: 'inherit',
    env: { ...process.env, NODE_PATH: [join(root, 'node_modules'), join(dir, 'node_modules')].join(':') },
  });
} finally {
  rmSync(out, { recursive: true, force: true });
}
