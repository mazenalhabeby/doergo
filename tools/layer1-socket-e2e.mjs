#!/usr/bin/env node
/**
 * Layer 1 — live updates (sockets): nobody hears what they may not see. LOCAL ONLY.
 *
 *   node tools/layer1-socket-e2e.mjs
 *
 * Five people connect to the notification service: the owner (the control — must hear everything below), another
 * organization's owner, Klaus (external, Weingärtner), Noor (plain employee) and Mike (Space Manager of Main Office
 * only). Then, as the owner, things happen in SERVICE CENTER — none of the four belongs there:
 *   a job is created, changed and commented on · a chat message to a Service Center member · hours added for them.
 * Every frame each listener receives is searched for the ids of those things. Also tried: a socket claiming
 * somebody else's identity, and joining that job's room directly. Cleans up what it created.
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { io } = require('socket.io-client');

const API = process.env.API ?? 'http://localhost:4000/api/v1';
const WS = process.env.WS ?? 'http://localhost:4001';
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(API)) throw new Error('local only');
const SC = 'space-service';
const failed = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && detail ? `  → ${String(detail).slice(0, 500)}` : ''}`);
  if (!ok) failed.push(name);
};
const sql = (q) =>
  execSync(`docker exec hbcfield-postgres psql -U hbcfield -d hbcfield -Atc ${JSON.stringify(q)}`).toString().trim();
execSync(`docker exec hbcfield-redis sh -c "redis-cli --scan --pattern 'throttle:*' | xargs -r redis-cli del"`);

async function call(method, path, token, body) {
  const r = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, data: json?.data ?? json };
}
async function login(email, password = 'password123') {
  const r = await call('POST', '/auth/login', null, { email, password });
  if (r.status >= 300) throw new Error(`login ${email}: ${r.status}`);
  return { token: r.data.accessToken, user: r.data.user };
}

const people = {
  owner: await login('client@example.com'),
  'other-org': await login('e2e-solo-owner@example.test', 'E2eSolo2026'),
  external: await login('klaus.huber@weingaertner.example'),
  employee: await login('noor@example.com'),
  leader: await login('mike@example.com'),
};

function connect(who, { token, user }, claim = user) {
  return new Promise((resolve) => {
    const frames = [];
    const s = io(WS, { auth: { token }, transports: ['websocket'], reconnection: false });
    s.onAny((event, ...args) => frames.push({ event, body: JSON.stringify(args) }));
    s.on('connect', () =>
      s.emit('authenticate', { userId: claim.id, role: claim.role, organizationId: claim.organizationId }, (ack) =>
        resolve({ who, s, frames, ack }),
      ),
    );
    s.on('connect_error', (e) => resolve({ who, s, frames, ack: { success: false, error: e.message } }));
    setTimeout(() => resolve({ who, s, frames, ack: { success: false, error: 'no answer' } }), 8000);
  });
}

const subs = {};
for (const [who, p] of Object.entries(people)) subs[who] = await connect(who, p);
for (const [who, c] of Object.entries(subs)) check(`${who} connects and authenticates`, c.ack?.success === true, JSON.stringify(c.ack));

// ── a socket cannot claim somebody else ─────────────────────────────────────────────────────────────────────────────
const spoof = await connect('spoof', people['other-org'], people.owner.user);
check("another organization's token claiming the owner's identity is refused", spoof.ack?.success !== true, JSON.stringify(spoof.ack));
spoof.s.close();

// ── things happen in Service Center ─────────────────────────────────────────────────────────────────────────────────
const owner = people.owner.token;
const scMember = sql(`select sa."userId" from space_assignments sa join users u on u.id=sa."userId" where sa."spaceId"='${SC}' and u.email not in ('mike@example.com','noor@example.com','client@example.com') and not u."isExternal" order by u.email limit 1`);
const created = await call('POST', '/tasks', owner, { title: 'L1 socket test', spaceId: SC });
const taskId = created.data?.id;
check('the owner creates a job in Service Center', !!taskId, JSON.stringify(created).slice(0, 200));

// joining the job's room directly
const joins = {};
for (const who of ['other-org', 'external', 'employee', 'leader']) {
  joins[who] = await new Promise((res) => {
    subs[who].s.emit('join_task', { taskId }, (ack) => res(ack));
    setTimeout(() => res({ timeout: true }), 4000);
  });
}

await call('PATCH', `/tasks/${taskId}`, owner, { description: 'L1 socket test — changed' });
await call('POST', `/tasks/${taskId}/comments`, owner, { content: 'L1 socket comment' });
const conv = await call('POST', '/chat/conversations', owner, { userId: scMember });
const convId = conv.data?.id;
if (convId) await call('POST', `/chat/conversations/${convId}/messages`, owner, { body: 'L1 socket chat' });
// A past day the member has NO hours on — a day already recorded is skipped, and a skip announces nothing.
const day = sql(
  `select d::date::text from generate_series(current_date - 40, current_date - 10, interval '1 day') d ` +
    `where not exists (select 1 from time_entries e where e."userId"='${scMember}' ` +
    `and e."clockInAt"::date between d::date - 1 and d::date + 1) order by d desc limit 1`,
);
const before = sql(`select coalesce(max("createdAt"), now())::text from time_entries`);
const manual = await call('POST', '/attendance/entries/manual', owner, {
  userId: scMember, locationId: SC, startDate: day, endDate: day, startTime: '06:00', endTime: '07:00',
});
await new Promise((r) => setTimeout(r, 6000));

// ── who heard what ──────────────────────────────────────────────────────────────────────────────────────────────────
const secrets = [taskId, convId, 'L1 socket chat', 'L1 socket comment'].filter(Boolean);
const heard = (who) => subs[who].frames.filter((f) => secrets.some((x) => f.body.includes(x)));
const ownerHeard = heard('owner').map((f) => f.event);
check('the owner (control) hears the job and the chat', ownerHeard.length > 0, 'heard nothing — events did not fire');
for (const who of ['other-org', 'external', 'employee', 'leader']) {
  const leak = heard(who);
  const joined = joins[who];
  check(`${who} could not join the job's room`, !(joined && joined.success === true), JSON.stringify(joined));
  check(`${who} heard nothing of the Service Center job, the chat or the comment`, leak.length === 0,
    leak.map((f) => `${f.event} ${f.body.slice(0, 120)}`).join(' | '));
}
// hours: the attendance rooms (clock review A1) — what the four heard about the Service Center member's hours
// The event names no person (`attendance.changed {action:'manual-add'}`), so it is matched by name.
const hoursHeard = (who) =>
  subs[who].frames.filter((f) => /^attendance\./.test(f.event) && (f.body.includes('manual-add') || f.body.includes(scMember)));
check('the owner (control) hears the added hours', hoursHeard('owner').length > 0 || manual.status >= 300,
  `manual entry ${manual.status}`);
for (const who of ['other-org', 'external', 'employee', 'leader']) {
  const h = hoursHeard(who);
  check(`${who} heard nothing about the Service Center member's hours`, h.length === 0, h.map((f) => f.event).join(','));
}

if (process.env.DEBUG) console.log('owner frames:', subs.owner.frames.map((f) => f.event + ' ' + f.body.slice(0, 100)).join('\n'));
// another organization hears nothing that names anybody of this one — presence included
const orgIds = sql(`select id from users where "organizationId"='${people.owner.user.organizationId}'`).split('\n').filter(Boolean);
const named = subs['other-org'].frames.filter((f) => orgIds.some((id) => f.body.includes(`"${id}"`)));
check('another organization hears nothing that names a member of this one (presence included)', named.length === 0,
  named.map((f) => f.event).join(','));
// ── clean up ────────────────────────────────────────────────────────────────────────────────────────────────────────
for (const c of Object.values(subs)) c.s.close();
if (taskId) await call('DELETE', `/tasks/${taskId}`, owner);
// The hours the test added — only rows made after it started, for that one member.
sql(`delete from time_entries where "userId"='${scMember}' and "createdAt" > '${before}'`);
console.log(failed.length ? `\n${failed.length} FAILED` : '\nALL PASSED');
process.exit(failed.length ? 1 : 0);
