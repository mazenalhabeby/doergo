#!/usr/bin/env node
/**
 * Chat phase 2 over real HTTP and sockets (docs/plans/chat-team.md §4).
 *
 *   node tools/chat-phase2-e2e.mjs      (gateway :4000, notification :4001, seed-demo data, object storage)
 *
 * ⚠️ LOCAL ONLY. Anna writes to Mike; Karim is a bystander. Deletes every message it
 * sends, recomputes the thread's counters, signs every session out (also on failure).
 *
 *   A. files: an upload link is this conversation's; foreign, never-uploaded and bare-link files are refused
 *   B. older history by (createdAt, id): pages never overlap or skip
 *   C. edit and remove (own, 15 minutes): every member's screen is told; others refused
 *   D. "Read": the writer's screen hears it
 *   E. mute: stored on the reader's row, the past refused
 *   F. people: a teammate opens, a stranger is 404; Team rows say who may be messaged
 *   G. the phone's offline copy: conversations whole, messages by cursor, files without links
 */
import { randomUUID } from 'node:crypto';
import { call, check, cleanup, connect, login, sleep, state } from './lib/chat-e2e-kit.mjs';

async function send(token, convId, body, attachments) {
  const id = `e2e-${randomUUID()}`;
  const r = await call('POST', `/chat/conversations/${convId}/messages`, token, {
    id,
    body,
    ...(attachments ? { attachments } : {}),
  });
  if (r.data?.id) state.sent.push(r.data.id);
  return r;
}

async function main() {
  const anna = await login('manager@example.com');
  const mike = await login('mike@example.com');
  const [annaS, mikeS] = [await connect(anna), await connect(mike)];
  const open = await call('POST', '/chat/conversations', anna.token, { userId: mike.user.id });
  const conv = (state.conversationId = open.data?.id);
  check('Anna opens the thread with Mike', !!conv, open.body);
  if (!conv) return;

  console.log('\n— A. files');
  const pre = await call('POST', `/chat/conversations/${conv}/attachments/presign`, anna.token, {
    fileName: 'note.txt',
    mimeType: 'text/plain',
  });
  check(
    'an upload link is a key under this conversation',
    typeof pre.data?.fileKey === 'string' && pre.data.fileKey.includes(`/chat/${conv}/`),
    pre.body,
  );
  /*
    No real upload here: local development stores files in REMOTE object storage,
    and a test must not write into a bucket that may hold real data. What is
    checked instead is everything the server decides — and those need no write.
  */
  const key = pre.data?.fileKey ?? `x/chat/${conv}/x.txt`;
  const file = { fileKey: key, fileName: 'note.txt', mimeType: 'text/plain', fileSize: 14 };
  const foreign = await send(anna.token, conv, 'x', [
    { ...file, fileKey: key.replace(`/chat/${conv}/`, '/chat/somebody-else/') },
  ]);
  check('a key from another conversation is refused', foreign.status === 400, foreign.status);
  const never = await send(anna.token, conv, 'x', [file]);
  check(
    'a key that was never uploaded is refused (storage is asked, nothing written)',
    never.status === 400,
    never.status,
  );
  const bare = await send(anna.token, conv, 'x', [
    { fileName: 'a.pdf', fileUrl: 'https://evil.example/a.pdf', mimeType: 'application/pdf' },
  ]);
  check('a bare link instead of a key is refused', bare.status === 400, bare.status);
  const empty = await send(anna.token, conv, '   ');
  check('a message with neither words nor a file is refused', empty.status === 400, empty.status);
  const exe = await call('POST', `/chat/conversations/${conv}/attachments/presign`, anna.token, {
    fileName: 'x.exe',
    mimeType: 'application/x-msdownload',
  });
  check('a program cannot be sent', exe.status === 400, exe.status);

  console.log('\n— B. older history');
  // Spaced out: a signed-in person may make 30 requests a second (throttle-limits.ts).
  for (let i = 0; i < 35; i++) {
    await send(anna.token, conv, `E2E page ${i}`);
    await sleep(80);
  }
  const first = await call('GET', `/chat/conversations/${conv}/messages`, mike.token);
  const oldest = first.data?.[0];
  const older = await call(
    'GET',
    `/chat/conversations/${conv}/messages?before=${encodeURIComponent(`${oldest?.createdAt}|${oldest?.id}`)}`,
    mike.token,
  );
  const ids = new Set((first.data ?? []).map((m) => m.id));
  check('the newest page is 30, and says there is more', first.data?.length === 30 && first.body?.hasMore === true, {
    n: first.data?.length,
    hasMore: first.body?.hasMore,
  });
  check(
    'the older page shares nothing with it',
    (older.data ?? []).length > 0 && (older.data ?? []).every((m) => !ids.has(m.id)),
  );
  check('…and is older', Date.parse(older.data?.at(-1)?.createdAt) <= Date.parse(oldest?.createdAt));

  console.log('\n— C. edit and remove');
  const mine = await send(anna.token, conv, 'E2E typo');
  mikeS.got.length = 0;
  const edited = await call('PATCH', `/chat/messages/${mine.data.id}`, anna.token, { body: 'E2E fixed' });
  check('Anna edits her message', edited.data?.body === 'E2E fixed' && !!edited.data?.editedAt, edited.body);
  const notHers = await call('PATCH', `/chat/messages/${mine.data.id}`, mike.token, { body: 'hijack' });
  check('Mike cannot edit it (reads as not found)', notHers.status === 404, notHers.status);
  const removed = await call('DELETE', `/chat/messages/${mine.data.id}`, anna.token);
  check('Anna removes it: no words left', removed.data?.body === '' && !!removed.data?.deletedAt, removed.body);
  await sleep(1200);
  const changed = mikeS.take('chat.messageChanged').filter((p) => p?.message?.id === mine.data.id);
  check("Mike's screen was told both times", changed.length === 2, changed.length);

  console.log('\n— D. read');
  annaS.got.length = 0;
  await call('POST', `/chat/conversations/${conv}/read`, mike.token, {});
  await sleep(1200);
  check(
    "Anna's screen hears that Mike read it",
    annaS.take('chat.read').some((p) => p?.conversationId === conv && p?.userId === mike.user.id),
  );
  const row = (await call('GET', '/chat/conversations', anna.token)).data?.find((c) => c.id === conv);
  check('the list row carries his read time', !!row?.readAt?.[mike.user.id], row?.readAt);

  console.log('\n— E. mute');
  const until = new Date(Date.now() + 3600_000).toISOString();
  const mute = await call('PATCH', `/chat/conversations/${conv}/mute`, mike.token, { until });
  check('Mike mutes the thread for an hour', mute.data?.mutedUntil === until, mute.body);
  const mikeRow = (await call('GET', '/chat/conversations', mike.token)).data?.find((c) => c.id === conv);
  check('…his row says so (and only his)', mikeRow?.mutedUntil === until);
  check(
    'the past is refused',
    (await call('PATCH', `/chat/conversations/${conv}/mute`, mike.token, { until: '2020-01-01T00:00:00Z' })).status ===
      400,
  );
  await call('PATCH', `/chat/conversations/${conv}/mute`, mike.token, { until: null });

  console.log('\n— F. people');
  const team = await call('GET', '/locations/team', mike.token);
  const rows = Array.isArray(team.data) ? team.data : [];
  check(
    'Team rows say whether Mike may message each person',
    rows.length > 0 && rows.every((r) => typeof r.canMessage === 'boolean'),
    rows.slice(0, 2),
  );
  const someone = rows.find((r) => r.id !== mike.user.id);
  if (someone) {
    const p = await call('GET', `/people/${someone.id}`, mike.token);
    check(
      'a teammate opens as Team shows them',
      p.data?.id === someone.id && typeof p.data?.canMessage === 'boolean',
      p.body,
    );
  }
  check('somebody not on his team is 404', (await call('GET', '/people/not-a-person', mike.token)).status === 404);

  console.log("\n— G. the phone's offline copy");
  const convs = await call('GET', '/sync/pull?scope=chat_conversations', mike.token);
  check(
    'conversations come whole, the same rows as the list',
    convs.body?.reset === true && convs.body.rows.some((c) => c.id === conv),
  );
  let cursor = null,
    pages = 0,
    rowsSeen = 0,
    linkless = true;
  do {
    const r = await call('GET', `/sync/pull?scope=chat_messages${cursor ? `&cursor=${cursor}` : ''}`, mike.token);
    rowsSeen += r.body?.rows?.length ?? 0;
    linkless &&= (r.body?.rows ?? []).every((m) => (m.attachments ?? []).every((a) => !a.url));
    cursor = r.body?.cursor;
    pages++;
    if (!r.body?.hasMore) break;
  } while (pages < 20);
  check('messages page through by cursor', rowsSeen >= 36, rowsSeen);
  check('…and files travel without links', linkless);
  const again = await call('GET', `/sync/pull?scope=chat_messages&cursor=${cursor}`, mike.token);
  check('a pull from the end returns nothing new', (again.body?.rows ?? []).length === 0, again.body?.rows?.length);
}

try {
  await main();
} catch (e) {
  state.failures++;
  console.log('FAIL (crashed)', e?.message ?? e);
} finally {
  await cleanup();
  console.log(state.failures ? `\n${state.failures} FAILED` : '\nALL PASSED');
  process.exit(state.failures ? 1 : 0);
}
