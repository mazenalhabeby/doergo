/**
 * Helpers for the LOCAL chat end-to-end checks (tools/chat-e2e.mjs, tools/chat-phase2-e2e.mjs):
 * real HTTP and sockets against the dev gateway (:4000) and notification service (:4001),
 * sign-in with the seed-demo password, and an undo that deletes every test message,
 * recomputes the thread's stored counters and signs every session out.
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const { io } = require('../../node_modules/socket.io-client');

export const BASE = 'http://localhost:4000/api/v1';
const SOCKET = 'http://localhost:4001';
const PASSWORD = 'password123';
/** Shared state: what to undo at the end. */
export const state = { failures: 0, sessions: [], sockets: [], sent: [], conversationId: null };

export const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok || detail === undefined ? '' : `  → ${JSON.stringify(detail)}`}`);
  if (!ok) state.failures++;
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function call(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* not json */
  }
  return { status: res.status, body: json, data: json?.data ?? json };
}

export async function login(email) {
  // Sign-in is rate-limited per address; repeated runs wait it out rather than fail.
  for (let i = 0; i < 30; i++) {
    const r = await call('POST', '/auth/login', null, { email, password: PASSWORD });
    if (r.data?.accessToken) {
      state.sessions.push([r.data.accessToken, r.data.refreshToken]);
      return { token: r.data.accessToken, user: r.data.user };
    }
    await sleep(5000);
  }
  throw new Error(`cannot sign in as ${email}`);
}

/** A socket signed in as `who`, collecting what it receives. */
export async function connect(who) {
  const s = io(SOCKET, { auth: { token: who.token }, transports: ['websocket'], reconnection: false });
  state.sockets.push(s);
  const got = [];
  s.onAny((event, payload) => got.push({ event, payload }));
  await new Promise((resolve, reject) => {
    s.on('connect', resolve);
    s.on('connect_error', reject);
  });
  await new Promise((resolve) => s.emit('authenticate', { userId: who.user.id }, resolve));
  return { s, got, take: (event) => got.filter((g) => g.event === event).map((g) => g.payload) };
}

export function psql(sql) {
  return execFileSync(
    'docker',
    ['exec', 'hbcfield-postgres', 'psql', '-U', 'hbcfield', '-d', 'hbcfield', '-tAc', sql],
    { encoding: 'utf8' },
  ).trim();
}

export async function cleanup() {
  try {
    if (state.sent.length) {
      const ids = state.sent.map((id) => `'${id.replace(/'/g, '')}'`).join(',');
      psql(`DELETE FROM messages WHERE id IN (${ids})`);
    }
    if (state.conversationId) {
      const c = state.conversationId.replace(/'/g, '');
      // Put the thread back as the migration would compute it.
      psql(`UPDATE conversations c SET "lastMessageId"=m.id, "lastMessagePreview"=LEFT(m.body,140), "lastSenderId"=m."senderId", "lastMessageAt"=m."createdAt"
            FROM (SELECT id, body, "senderId", "createdAt" FROM messages WHERE "conversationId"='${c}' ORDER BY "createdAt" DESC, id DESC LIMIT 1) m WHERE c.id='${c}'`);
      psql(`UPDATE conversations SET "lastMessageId"=NULL, "lastMessagePreview"=NULL, "lastSenderId"=NULL, "lastMessageAt"=NULL
            WHERE id='${c}' AND NOT EXISTS (SELECT 1 FROM messages WHERE "conversationId"='${c}')`);
      psql(
        `UPDATE conversation_members cm SET "unreadCount"=(SELECT COUNT(*) FROM messages m WHERE m."conversationId"=cm."conversationId" AND m."senderId"<>cm."userId" AND (cm."lastReadAt" IS NULL OR m."createdAt">cm."lastReadAt")) WHERE cm."conversationId"='${c}'`,
      );
    }
  } catch (e) {
    console.log('cleanup (database) failed:', e.message);
  }
  for (const s of state.sockets) s.disconnect();
  for (const [access, refresh] of state.sessions)
    await call('POST', '/auth/logout', access, { refreshToken: refresh }).catch(() => {});
  console.log(`signed out ${state.sessions.length} sessions, removed ${state.sent.length} test messages`);
}
