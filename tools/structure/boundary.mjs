/**
 * `@hbcfield/shared/client` is what the web app and the phone load. Nothing it reaches may be
 * server code: Nest, Prisma, validation decorators, queues, mail sending, or a Node built-in —
 * the phone cannot run them and the web bundle should not carry them
 * (docs/plans/code-structure-fix.md, Phase 0.4).
 *
 * Walks the value imports from packages/shared/src/client.ts (type-only imports are erased and
 * do not count) and lists every server package reached, with the file that imports it.
 */
import { readImports } from './graph.mjs';

export const CLIENT_ENTRY = 'packages/shared/src/client.ts';

const NODE_BUILTINS = new Set([
  'assert',
  'buffer',
  'child_process',
  'cluster',
  'crypto',
  'dgram',
  'dns',
  'events',
  'fs',
  'http',
  'http2',
  'https',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'querystring',
  'readline',
  'stream',
  'tls',
  'url',
  'util',
  'v8',
  'vm',
  'worker_threads',
  'zlib',
]);
const SERVER_PACKAGES = [
  /^@nestjs\//,
  /^@prisma\//,
  /^\.prisma\//,
  /^class-validator$/,
  /^class-transformer$/,
  /^bullmq$/,
  /^ioredis$/,
  /^nodemailer$/,
  /^rxjs$/,
  /^reflect-metadata$/,
  /^expo-server-sdk$/,
  /^@aws-sdk\//,
];

export function isServerSpec(spec) {
  if (spec.startsWith('node:')) return true;
  if (NODE_BUILTINS.has(spec.split('/')[0])) return true;
  return SERVER_PACKAGES.some((re) => re.test(spec));
}

/** "file → package" for every server package reachable from the client entry. */
export function boundaryLeaks(entry = CLIENT_ENTRY) {
  const seen = new Set();
  const queue = [entry];
  const leaks = new Set();
  while (queue.length) {
    const f = queue.shift();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const imp of readImports(f)) {
      if (imp.typeOnly) continue;
      if (imp.to) queue.push(imp.to);
      else if (imp.bare && isServerSpec(imp.spec)) leaks.add(`${f} → ${imp.spec}`);
    }
  }
  return { leaks: [...leaks].sort(), reached: seen.size };
}
