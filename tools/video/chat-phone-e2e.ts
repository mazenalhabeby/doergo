/**
 * Chat across devices, LOCAL: Anna in a browser (localhost:3000), Dana on the iOS
 * simulator (dev build + Metro, already signed in as Dana), driven by Maestro
 * flows in tools/maestro/chat/. Measures what Anna sees and how fast.
 *   JAVA_HOME=/opt/homebrew/opt/openjdk@17 node chat-phone-e2e.ts <simulator-udid>
 * Deletes the messages it created, recomputes the thread's counters, resets mutes,
 * and signs Anna's session out — also on failure. Dana's phone session is left as found.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WEB_URL } from './config.ts';

const udid = process.argv[2];
const API = 'http://localhost:4000/api/v1';
const FLOWS = path.resolve(import.meta.dirname, '../maestro/chat');
let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok || detail === undefined ? '' : `  → ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
};
const psql = (sql: string) =>
  execFileSync('docker', ['exec', 'hbcfield-postgres', 'psql', '-U', 'hbcfield', '-d', 'hbcfield', '-tAc', sql], {
    encoding: 'utf8',
  }).trim();
/** One Maestro flow on the simulator; true when every step passed. */
function phone(flow: string, env: Record<string, string> = {}): boolean {
  // The values are written into a copy of the flow: this Maestro did not substitute `-e` values.
  let yaml = readFileSync(path.join(FLOWS, flow), 'utf8');
  for (const [k, v] of Object.entries(env)) yaml = yaml.replaceAll('${' + k + '}', v.replace(/["\\]/g, ''));
  const copy = path.join(tmpdir(), `hbc-${flow}`);
  writeFileSync(copy, yaml);
  const args = ['--device', udid, 'test', copy];
  try {
    const out = execFileSync('maestro', args, {
      encoding: 'utf8',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    console.log(
      out
        .split('\n')
        .filter((l) => /COMPLETED|FAILED|SKIPPED/.test(l))
        .map((l) => `   phone: ${l.trim()}`)
        .join('\n'),
    );
    return true;
  } catch (e: any) {
    console.log(
      String(e.stdout ?? '')
        .split('\n')
        .filter((l) => /FAILED|COMPLETED/.test(l))
        .map((l) => `   phone: ${l.trim()}`)
        .join('\n'),
    );
    return false;
  }
}

const started = new Date().toISOString();
const stamp = Date.now();
const MSG = `E2E phone hello ${stamp}`;
const REPLY = `E2E phone reply ${stamp}`;
const EDITED = `E2E phone fixed ${stamp}`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
let token = '';
let conversationId = '';
page.on('response', async (r) => {
  if (r.url().endsWith('/auth/login')) {
    try {
      token = (await r.json())?.data?.accessToken ?? token;
    } catch {
      /* */
    }
  }
});

try {
  const dana = await (
    await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'dana@example.com', password: 'password123' }),
    })
  ).json();
  const danaId = dana?.data?.user?.id;
  // A check-only session for Dana's id; signed out at once (the phone keeps its own).
  await fetch(`${API}/auth/logout`, {
    method: 'POST',
    headers: { authorization: `Bearer ${dana?.data?.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: dana?.data?.refreshToken }),
  });

  // A dev server under load (Metro, the simulator and Maestro beside it) can take a while to serve.
  page.setDefaultTimeout(90_000);
  await page.goto(`${WEB_URL}/login`, { timeout: 120_000 });
  await page.locator('#login-email').waitFor({ timeout: 120_000 });
  await page.fill('#login-email', 'manager@example.com');
  await page.fill('#login-password', 'password123');
  await page.click('form button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 90_000 });

  check('the phone is signed in as Dana', phone('00-sign-in.yaml', { EMAIL: 'dana@example.com' }));

  console.log('\n— 1. Anna (web) writes to Dana (phone)');
  await page.goto(`${WEB_URL}/messages?with=${danaId}`);
  await page.waitForURL(/\/messages\?c=/, { timeout: 90_000 });
  conversationId = new URL(page.url()).searchParams.get('c') ?? '';
  const box = page.getByLabel('Write a message…');
  await box.fill(MSG);
  await box.press('Enter');
  await page.getByText(MSG).first().waitFor({ timeout: 10_000 });

  console.log('\n— 2. On the phone: the count on Team, the row, the thread, a reply');
  const t0 = Date.now();
  check(
    "Dana sees the count, the conversation and Anna's message, then answers",
    phone('02-receive-reply.yaml', { MSG, REPLY }),
  );
  await page
    .getByText(REPLY)
    .first()
    .waitFor({ timeout: 15_000 })
    .catch(() => {});
  check(
    `Anna sees Dana's answer on the web (whole phone round ${Math.round((Date.now() - t0) / 1000)} s incl. driving the phone)`,
    await page
      .getByText(REPLY)
      .first()
      .isVisible()
      .catch(() => false),
  );
  check(
    '…and "✓✓ Read" under her own message (Dana opened it)',
    await page
      .getByText(/✓✓ Read/)
      .first()
      .isVisible()
      .catch(() => false),
  );

  console.log("\n— 3. On the phone: edit by long press, mute and unmute, Anna's profile");
  check(
    "Dana edits her answer, mutes and unmutes, opens Anna's profile",
    phone('03-edit-profile-mute.yaml', { REPLY, EDITED }),
  );
  await page
    .getByText(EDITED)
    .first()
    .waitFor({ timeout: 10_000 })
    .catch(() => {});
  check(
    'Anna sees the edit live, marked edited',
    (await page
      .getByText(EDITED)
      .first()
      .isVisible()
      .catch(() => false)) &&
      (await page
        .getByText(/edited/)
        .first()
        .isVisible()
        .catch(() => false)),
  );
  await page.screenshot({ path: path.join(process.env.SHOTS ?? '/tmp', 'web-anna-after-phone.png') }).catch(() => {});
} catch (e) {
  failures++;
  console.log('FAIL (crashed)', (e as Error).message);
} finally {
  try {
    psql(
      `DELETE FROM messages WHERE (body LIKE 'E2E phone%' OR "deletedAt" IS NOT NULL) AND "createdAt" >= '${started}'`,
    );
    if (/^[\w-]+$/.test(conversationId)) {
      const c = conversationId;
      psql(
        `UPDATE conversations c SET "lastMessageId"=m.id, "lastMessagePreview"=LEFT(m.body,140), "lastSenderId"=m."senderId", "lastMessageAt"=m."createdAt" FROM (SELECT id, body, "senderId", "createdAt" FROM messages WHERE "conversationId"='${c}' ORDER BY "createdAt" DESC, id DESC LIMIT 1) m WHERE c.id='${c}'`,
      );
      psql(
        `UPDATE conversations SET "lastMessageId"=NULL, "lastMessagePreview"=NULL, "lastSenderId"=NULL, "lastMessageAt"=NULL WHERE id='${c}' AND NOT EXISTS (SELECT 1 FROM messages WHERE "conversationId"='${c}')`,
      );
      psql(`UPDATE conversation_members SET "mutedUntil"=NULL WHERE "conversationId"='${c}'`);
      psql(
        `UPDATE conversation_members cm SET "unreadCount"=(SELECT COUNT(*) FROM messages m WHERE m."conversationId"=cm."conversationId" AND m."senderId"<>cm."userId" AND (cm."lastReadAt" IS NULL OR m."createdAt">cm."lastReadAt")) WHERE cm."conversationId"='${c}'`,
      );
    }
  } catch (e) {
    console.log('cleanup failed:', (e as Error).message);
  }
  const r = await page.request
    .post(`${API}/auth/logout`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, data: {} })
    .catch(() => null);
  console.log(`  Anna signed out ${r?.status() ?? 'failed'}`);
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
}
