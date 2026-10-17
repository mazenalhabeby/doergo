/**
 * Chat on the LOCAL web app, used by two people at once (phase 1, docs/plans/chat-team.md).
 *   node chat-web-e2e.ts [outDir]
 *
 * Anna (manager) and Mike (worker) each in their own browser. Checks what a
 * person sees AND what each screen costs: requests to /chat per incoming
 * message, and how long a message takes to appear on the other screen.
 * ⚠️ LOCAL ONLY. Deletes the messages it sent, recomputes the thread's stored
 * counters, and signs out both sessions — also on failure.
 */
import { chromium, type Browser, type Page } from 'playwright';
import { execFileSync } from 'node:child_process';
import { WEB_URL } from './config.ts';

const out = process.argv[2];
const API = 'http://localhost:4000/api/v1';
let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok || detail === undefined ? '' : `  → ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
};
const psql = (sql: string) =>
  execFileSync('docker', ['exec', 'hbcfield-postgres', 'psql', '-U', 'hbcfield', '-d', 'hbcfield', '-tAc', sql], {
    encoding: 'utf8',
  }).trim();

type Person = { page: Page; token: string; chatCalls: string[]; close: () => Promise<void> };

async function signIn(browser: Browser, email: string): Promise<Person> {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'en-GB',
    timezoneId: 'Europe/Vienna',
  });
  const page = await ctx.newPage();
  let token = '';
  const chatCalls: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('/api/v1/chat/')) chatCalls.push(`${r.method()} ${u.replace(/^.*\/api\/v1/, '')}`);
  });
  page.on('response', async (r) => {
    if (r.url().endsWith('/auth/login') && r.status() < 300) {
      try {
        const j = await r.json();
        token = j?.data?.accessToken ?? j?.accessToken ?? token;
      } catch {
        /* */
      }
    }
  });
  page.on('pageerror', (e) => console.log(`  [${email}] page error: ${e.message}`));
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#login-email').waitFor();
  await page.fill('#login-email', email);
  await page.fill('#login-password', 'password123');
  await page.click('form button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 90_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
  return {
    page,
    token,
    chatCalls,
    close: async () => {
      const r = await page.request
        .post(`${API}/auth/logout`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, data: {} })
        .catch(() => null);
      console.log(`  ${email} signed out ${r?.status() ?? 'failed'}`);
      await ctx.close();
    },
  };
}

/** Inside the chat drawer only — a pop-up may carry the same words. */
const inChat = (p: Page, text: string) => p.getByRole('dialog', { name: 'Messages' }).getByText(text);
const messagesButton = (p: Page) => p.locator('button[aria-label^="Messages,"]').first();
const badgeText = async (p: Page) => (await messagesButton(p).locator('span').allTextContents()).join('').trim();
const shot = async (p: Page, name: string) => {
  if (out) await p.screenshot({ path: `${out}/${name}.png` });
};

const browser = await chromium.launch();
const people: Person[] = [];
let conversationId = '';
const started = new Date().toISOString();

try {
  const anna = await signIn(browser, 'manager@example.com');
  people.push(anna);
  const mike = await signIn(browser, 'mike@example.com');
  people.push(mike);
  await mike.page.waitForTimeout(4000); // the page's first load, then the badge's read
  await messagesButton(mike.page).waitFor({ timeout: 30_000 });
  const startBadge = Number((await badgeText(mike.page)) || 0);

  console.log('\n— 1. Anna finds Mike on Team and presses Message');
  await anna.page.goto(`${WEB_URL}/team`, { waitUntil: 'domcontentloaded' });
  await anna.page.getByLabel('Search name, job, workspace').fill('Mike');
  await anna.page.getByRole('button', { name: 'Message', exact: true }).first().click();
  await anna.page.waitForURL(/\/messages\?c=/, { timeout: 20_000 });
  conversationId = new URL(anna.page.url()).searchParams.get('c') ?? '';
  const box = anna.page.getByLabel('Write a message…');
  await box.waitFor({ timeout: 20_000 });
  check('Message opens the Messages page on the conversation with Mike', !!conversationId && (await box.isVisible()));
  check('the person panel shows who it is', await anna.page.getByText('Mike Weber').first().isVisible());
  await shot(anna.page, '1-anna-messages');

  console.log('\n— 2. Mike is on his dashboard; Anna writes');
  mike.chatCalls.length = 0;
  const first = `E2E hello ${Date.now()}`;
  await box.fill(first);
  const t0 = Date.now();
  await box.press('Enter');
  await mike.page
    .waitForFunction(
      (n) => {
        const b = document.querySelector('button[aria-label^="Messages,"]');
        return !!b && Number(b.textContent?.replace(/\D/g, '') || 0) > n;
      },
      startBadge,
      { timeout: 15_000 },
    )
    .catch(() => {});
  const badgeMs = Date.now() - t0;
  check("Mike's Messages badge goes up by one, live", Number((await badgeText(mike.page)) || 0) === startBadge + 1);
  check(`…within a second (${badgeMs} ms)`, badgeMs < 1000, badgeMs);
  check("Mike's screen made NO chat request for it", mike.chatCalls.length === 0, mike.chatCalls);

  console.log('\n— 3. Mike opens Messages from the top bar, then the conversation');
  await messagesButton(mike.page).click();
  await mike.page.waitForURL(/\/messages/, { timeout: 20_000 });
  const row = mike.page.getByRole('button', { name: /Anna Müller/ }).first();
  await row.waitFor({ timeout: 20_000 });
  const pill = (
    await row
      .locator('span.bg-blue-600')
      .textContent()
      .catch(() => '')
  )?.trim();
  check(
    'the list row shows the message and 1 unread',
    (await row.textContent())?.includes(first.slice(0, 20)) === true && pill === '1',
    { pill },
  );
  mike.chatCalls.length = 0;
  await row.click();
  await mike.page.getByText(first).first().waitFor({ timeout: 15_000 });
  await mike.page.waitForTimeout(1500);
  check(
    'the badge is gone once read',
    (await badgeText(mike.page)) === '' || Number(await badgeText(mike.page)) === startBadge,
    await badgeText(mike.page),
  );
  check(
    'opening cost: the history and one read mark',
    mike.chatCalls.filter((c) => !c.includes('/badge')).length <= 3,
    mike.chatCalls,
  );
  await shot(mike.page, '2-mike-thread');

  console.log('\n— 4. Anna sees "Read"');
  await anna.page
    .getByText(/✓✓ Read/)
    .first()
    .waitFor({ timeout: 10_000 })
    .catch(() => {});
  check(
    "Anna's message says ✓✓ Read, live",
    await anna.page
      .getByText(/✓✓ Read/)
      .first()
      .isVisible()
      .catch(() => false),
  );

  console.log('\n— 5. typing, a live message, Mike answers');
  await box.fill('typing…');
  await mike.page
    .getByText('is typing…')
    .waitFor({ timeout: 5_000 })
    .catch(() => {});
  check(
    'Mike sees "Anna is typing…"',
    await mike.page
      .getByText('is typing…')
      .isVisible()
      .catch(() => false),
  );
  mike.chatCalls.length = 0;
  const second = `E2E second ${Date.now()}`;
  await box.fill(second);
  const t1 = Date.now();
  await box.press('Enter');
  await mike.page.getByText(second).first().waitFor({ timeout: 10_000 });
  const deliverMs = Date.now() - t1;
  check(`it appears in Mike's open thread (${deliverMs} ms)`, deliverMs < 1000, deliverMs);
  await mike.page.waitForTimeout(1200);
  check(
    '…with no reload, only the read mark',
    mike.chatCalls.every((c) => c.startsWith('POST') && c.endsWith('/read')),
    mike.chatCalls,
  );
  const reply = `E2E reply ${Date.now()}`;
  const mbox = mike.page.getByLabel('Write a message…');
  await mbox.fill(reply);
  const t2 = Date.now();
  await mbox.press('Enter');
  await anna.page.getByText(reply).first().waitFor({ timeout: 10_000 });
  check(`Anna sees the reply (${Date.now() - t2} ms)`, Date.now() - t2 < 1000);

  console.log('\n— 6. Anna edits, then removes her message');
  const mineBubble = anna.page.getByText(second).first();
  await mineBubble.hover();
  await anna.page.getByRole('button', { name: 'Edit' }).last().click();
  await box.fill(`${second} (fixed)`);
  await box.press('Enter');
  await mike.page
    .getByText(`${second} (fixed)`)
    .first()
    .waitFor({ timeout: 10_000 })
    .catch(() => {});
  check(
    "the edit appears on Mike's screen, marked edited",
    await mike.page
      .getByText(`${second} (fixed)`)
      .first()
      .isVisible()
      .catch(() => false),
  );
  await anna.page.getByText(`${second} (fixed)`).first().hover();
  await anna.page.getByRole('button', { name: 'Remove' }).last().click();
  // The confirm is in the pop-up that asks — wait for it, then press its own button.
  const ask = anna.page.locator('[data-sonner-toast]', { hasText: 'Remove this message for everyone?' });
  await ask.waitFor({ timeout: 5_000 });
  await ask.getByRole('button', { name: 'Remove' }).click();
  await mike.page
    .getByText('Message removed')
    .first()
    .waitFor({ timeout: 10_000 })
    .catch(() => {});
  check(
    'Mike sees "Message removed" in its place',
    await mike.page
      .getByText('Message removed')
      .first()
      .isVisible()
      .catch(() => false),
  );
  await shot(mike.page, '3-mike-edited-removed');

  console.log('\n— 7. Mike mutes the conversation');
  await mike.page.getByRole('button', { name: 'Turn notifications off', exact: true }).click();
  await mike.page.getByRole('menuitem', { name: 'For 1 hour' }).click();
  const bell = mike.page.getByRole('button', { name: 'Notifications off', exact: true });
  await bell.waitFor({ timeout: 5_000 }).catch(() => {});
  check('the bell shows it is muted', await bell.isVisible().catch(() => false));
  await bell.click();
  await mike.page.getByRole('menuitem', { name: 'Turn notifications back on' }).click();
  await mike.page
    .getByRole('button', { name: 'Turn notifications off', exact: true })
    .waitFor({ timeout: 5_000 })
    .catch(() => {});
  check(
    '…and back on',
    await mike.page
      .getByRole('button', { name: 'Turn notifications off', exact: true })
      .isVisible()
      .catch(() => false),
  );

  console.log('\n— 8. Team, as a member');
  await mike.page.goto(`${WEB_URL}/team`, { waitUntil: 'domcontentloaded' });
  await mike.page.getByLabel('Search name, job, workspace').waitFor({ timeout: 20_000 });
  check(
    'Team opens for a member, with search and status filters',
    await mike.page.getByRole('button', { name: /^Available/ }).isVisible(),
  );
  check('no Call buttons anywhere on Team', (await mike.page.getByRole('button', { name: /call/i }).count()) === 0);
  await shot(mike.page, '4-mike-team');
} catch (e) {
  failures++;
  console.log('FAIL (crashed)', (e as Error).message);
} finally {
  try {
    psql(`DELETE FROM messages WHERE (body LIKE 'E2E %' OR "deletedAt" IS NOT NULL) AND "createdAt" >= '${started}'`);
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
    console.log('cleanup (database) failed:', (e as Error).message);
  }
  for (const p of people) await p.close();
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
}
