#!/usr/bin/env node
/**
 * Chat phase 1 over real HTTP and real sockets (docs/plans/chat-team.md §3).
 *
 *   node tools/chat-e2e.mjs        (gateway :4000, notification :4001, seed-demo data)
 *
 * ⚠️ LOCAL ONLY. Anna (manager) writes to Mike; Karim is a bystander in the same
 * organization. Every message it sends is deleted at the end and the thread's
 * stored counters are recomputed (also on failure); every session is signed out.
 *
 *   A. a message reaches the other person with THEIR unread count and total
 *   B. the list row reads the stored newest message; the badge is one number
 *   C. the same client id twice is one message, counted once
 *   D. "typing" reaches the conversation's member — not a colleague the sender names
 *   E. reading drops the total, and the reader's screens are told
 *   F. the members list is not cut at 10
 */
import { randomUUID } from 'node:crypto';
import { call, check, cleanup, connect, login, sleep, state } from './lib/chat-e2e-kit.mjs';

async function main() {
  const anna = await login('manager@example.com');
  const mike = await login('mike@example.com');
  const karim = await login('karim@example.com');
  const owner = await login('client@example.com');
  const [annaS, mikeS, karimS] = [await connect(anna), await connect(mike), await connect(karim)];

  const open = await call('POST', '/chat/conversations', anna.token, { userId: mike.user.id });
  const conversationId = (state.conversationId = open.data?.id);
  check('Anna can open a thread with Mike', open.status < 300 && !!conversationId, open.body);
  if (!conversationId) return;
  const before = (await call('GET', '/chat/badge', mike.token)).data?.total ?? -1;
  check('Mike has a badge number to start from', Number.isInteger(before), before);

  console.log("\n— A. a message arrives with the reader's own numbers");
  const id = `e2e-${randomUUID()}`;
  const send = await call('POST', `/chat/conversations/${conversationId}/messages`, anna.token, {
    id,
    body: 'Phase 1 check: is the valve in the van?',
  });
  if (send.data?.id) state.sent.push(send.data.id);
  check('the message keeps the id the sender made', send.data?.id === id, send.body);
  await sleep(1500);
  const evt = mikeS.take('chat.message').find((p) => p?.message?.id === id);
  check("Mike's socket receives it", !!evt);
  check('…with his unread count for the thread', Number.isInteger(evt?.unread) && evt.unread >= 1, evt?.unread);
  check('…and his new total', evt?.badge === before + 1, { badge: evt?.badge, before });
  const annaEvt = annaS.take('chat.message').find((p) => p?.message?.id === id);
  check("Anna's other screens get it too, with nothing unread for her", annaEvt?.unread === 0, annaEvt?.unread);
  check(
    'Karim, not in the thread, receives nothing',
    !karimS.take('chat.message').some((p) => p?.conversationId === conversationId),
  );

  console.log('\n— B. the list and the badge read stored numbers');
  const badge = (await call('GET', '/chat/badge', mike.token)).data?.total;
  check('GET /chat/badge is one higher', badge === before + 1, { badge, before });
  const list = (await call('GET', '/chat/conversations', mike.token)).data ?? [];
  const row = list.find((c) => c.id === conversationId);
  check(
    'the list row carries the stored newest message',
    row?.lastMessage?.id === id && row?.lastMessage?.body.startsWith('Phase 1 check'),
    row?.lastMessage,
  );
  check("the list row carries Mike's unread count", row?.unread === evt?.unread, row?.unread);

  console.log('\n— C. a resend is the same message, counted once');
  const again = await call('POST', `/chat/conversations/${conversationId}/messages`, anna.token, {
    id,
    body: 'Phase 1 check: is the valve in the van?',
  });
  check('the same id comes back as the same message', again.data?.id === id, again.body);
  check("Mike's total did not move", (await call('GET', '/chat/badge', mike.token)).data?.total === before + 1);

  console.log('\n— D. typing reaches members only');
  mikeS.got.length = 0;
  karimS.got.length = 0;
  annaS.s.emit('chat_typing', { conversationId, recipientIds: [karim.user.id, mike.user.id] });
  await sleep(1200);
  check(
    'Mike sees Anna typing',
    mikeS.take('chat.typing').some((p) => p?.conversationId === conversationId && p?.from === anna.user.id),
  );
  check(
    'Karim, named by the sender but not in the thread, sees nothing',
    karimS.take('chat.typing').length === 0,
    karimS.take('chat.typing'),
  );
  karimS.s.emit('chat_typing', { conversationId });
  await sleep(1200);
  check(
    'Karim cannot make "typing" appear in a thread he is not in',
    !mikeS.take('chat.typing').some((p) => p?.from === karim.user.id),
  );

  console.log('\n— E. reading drops the total everywhere');
  mikeS.got.length = 0;
  const read = await call('POST', `/chat/conversations/${conversationId}/read`, mike.token, {});
  check('Mike reads the thread', read.status < 300, read.body);
  await sleep(1200);
  const badgeEvt = mikeS.take('chat.badge')[0];
  // Everything unread in this thread (the new message and anything older) leaves the total.
  const expected = before + 1 - (evt?.unread ?? 0);
  check('his screens are told the new total', badgeEvt?.total === expected, { badgeEvt, expected });
  check('GET /chat/badge agrees', (await call('GET', '/chat/badge', mike.token)).data?.total === badgeEvt?.total);

  console.log('\n— F. the members list is not cut at 10');
  const members = await call('GET', '/organizations/members?page=1&limit=200', owner.token);
  const n = Array.isArray(members.data) ? members.data.length : -1;
  const total = members.body?.meta?.total;
  check('one page of 200 holds every member of the demo org', n === total && n > 10, { n, total });
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
