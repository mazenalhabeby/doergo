#!/usr/bin/env node
/**
 * Hand-written message patterns may only disappear.
 *
 *   node tools/rpc-ratchet.mjs            check (exit 1 if any file has MORE than its baseline)
 *   node tools/rpc-ratchet.mjs --update   lower the baseline to today's counts (never raises it)
 *
 * A pattern written as a string — `send({ cmd: 'x' }, …)` or `@MessagePattern({ cmd: 'x' })` —
 * carries no types: the payload is `any` at both ends. The typed way is a contract in
 * packages/shared/src/microservices/contracts (see contract.ts). Every file's count of
 * string patterns is recorded; it may shrink, never grow, and a new file must have none.
 *
 * Events are counted the same way, against their own baseline (tools/event-baseline.json):
 * `notificationClient.emit('x', …)` (and the other service clients, and a service's own
 * `this.emit('x', …)` wrapper) and `@EventPattern('x')`. The typed way is an event contract
 * (packages/shared/src/microservices/event.ts). Socket.IO emits in notification-service are
 * not service events and are not counted.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BASELINE = path.join(ROOT, 'tools/rpc-baseline.json');
const EVENT_BASELINE = path.join(ROOT, 'tools/event-baseline.json');
const DIRS = ['apps/api'];
const PATTERN = /\{\s*cmd:\s*['"`]/g;
const EVENT_PATTERN =
  /(?:\b(?:notificationClient|notifications|taskClient|authClient|trackingClient)\.emit|@EventPattern)\(\s*['"`]|(?<![.\w])this\.emit\(\s*['"`]/g;

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '__tests__') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.ts$/.test(e.name) && !/\.(spec|test|d)\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

function counts(re, skip = () => false) {
  const now = {};
  for (const d of DIRS) {
    for (const f of walk(path.join(ROOT, d), [])) {
      const rel = path.relative(ROOT, f);
      if (skip(rel)) continue;
      const n = (fs.readFileSync(f, 'utf8').match(re) ?? []).length;
      if (n) now[rel] = n;
    }
  }
  return now;
}

/** this.emit('x') is a service's own wrapper; in notification-service it is Socket.IO. */
const notSocket = (rel) => rel.startsWith('apps/api/notification-service/src/modules/websocket/');

/** One ratchet: check, or (with --update / no baseline yet) record the lower counts. Returns false on failure. */
function ratchet(label, re, file, hint, skip) {
  const now = counts(re, skip);
  const total = Object.values(now).reduce((a, b) => a + b, 0);
  const baseline = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  const grew = baseline ? Object.keys(now).filter((f) => now[f] > (baseline[f] ?? 0)) : [];

  if (process.argv.includes('--update') || !baseline) {
    if (grew.length) {
      console.error(
        `${label} ratchet: refusing to update — more string patterns than recorded in:\n  ${grew.join('\n  ')}`,
      );
      return false;
    }
    const next = {};
    for (const [f, n] of Object.entries(now)) next[f] = baseline?.[f] !== undefined ? Math.min(n, baseline[f]) : n;
    fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
    console.log(`${label} baseline: ${total} string pattern(s) in ${Object.keys(next).length} file(s)`);
    return true;
  }
  if (grew.length) {
    console.error(`${label} ratchet — ${hint}:`);
    for (const f of grew) console.error(`  ${f}: ${now[f]} (recorded ${baseline[f] ?? 0})`);
    return false;
  }
  const before = Object.values(baseline).reduce((a, b) => a + b, 0);
  const fewer = total < before ? `, ${before - total} fewer than recorded` : '';
  console.log(`${label} ratchet: ok — ${total} string pattern(s) left${fewer}`);
  return true;
}

const rpcOk = ratchet(
  'rpc',
  PATTERN,
  BASELINE,
  'use a contract (packages/shared/src/microservices/contracts), not { cmd: "…" }',
);
const eventOk = ratchet(
  'event',
  EVENT_PATTERN,
  EVENT_BASELINE,
  "use an event contract (packages/shared/src/microservices/event.ts), not emit('…') / @EventPattern('…')",
  notSocket,
);
if (!rpcOk || !eventOk) process.exit(1);
