#!/usr/bin/env node
/**
 * Chat phase 3 over real HTTP and sockets (docs/plans/chat-team.md §5).
 *
 *   node tools/chat-phase3-e2e.mjs      (gateway :4000, notification :4001, seed-demo data)
 *
 * ⚠️ LOCAL ONLY. John (admin) starts a group with Mike and Karim; a job of Mike's
 * gets a chat. Deletes the conversations it made (their messages go with them),
 * puts the job's status and crew back, signs every session out (also on failure).
 *
 *   A. groups: who may start one, the members, system lines, rename/add/remove/leave, refusals
 *   B. a job's chat: the crew + the office, a stranger 404, follows the crew, closed when the job is over
 *   C. search: only the caller's own conversations, prefix words, never a removed message
 */
import { randomUUID } from 'node:crypto';
import { call, check, cleanup, connect, login, psql, sleep, state } from './lib/chat-e2e-kit.mjs';

const made = { conversations: [], task: null, noorFlag: null };
const TASK = 'cmrtizaxm009xsbdfkmb026d6'; // "Cooling tower cleaning", Mike's, canonical flow (seed-demo)

async function send(token, convId, body) {
  const r = await call('POST', `/chat/conversations/${convId}/messages`, token, { id: `e2e-${randomUUID()}`, body });
  if (r.data?.id) state.sent.push(r.data.id);
  return r;
}
const ids = (conv) => (conv?.members ?? []).map((m) => m.id).sort();
const listed = async (who, id) =>
  ((await call('GET', '/chat/conversations', who.token)).data ?? []).find((c) => c.id === id);

async function main() {
  const john = await login('client@example.com');
  const mike = await login('mike@example.com');
  const karim = await login('karim@example.com');
  const sarah = await login('sarah@example.com');
  const [mikeS, karimS, sarahS] = [await connect(mike), await connect(karim), await connect(sarah)];

  console.log('\n— A. groups');
  /*
    A plain member: seed-demo gives every employee the LEGACY canManageUsers
    column (which still counts locally), so Noor — who leads no workspace — has
    it switched off for this run and back on at the end.
  */
  const noor = await login('noor@example.com');
  made.noorFlag = psql(`SELECT "canManageUsers" FROM users WHERE id='${noor.user.id}'`);
  psql(`UPDATE users SET "canManageUsers"=false WHERE id='${noor.user.id}'`);
  const capNoor = await call('GET', '/chat/capabilities', noor.token);
  const capMike = await call('GET', '/chat/capabilities', mike.token);
  const capJohn = await call('GET', '/chat/capabilities', john.token);
  check(
    'a member may not start a group; a leader and an administrator may',
    capNoor.data?.mayCreateGroup === false &&
      capMike.data?.mayCreateGroup === true &&
      capJohn.data?.mayCreateGroup === true,
    [capNoor.body, capMike.body, capJohn.body],
  );
  const refused = await call('POST', '/chat/groups', noor.token, { title: 'Mine', memberIds: [mike.user.id] });
  if (refused.data?.id) made.conversations.push(refused.data.id);
  check(
    'a member starting a group is refused (403 CHAT_GROUP_NOT_ALLOWED)',
    refused.status === 403 && refused.body?.code === 'CHAT_GROUP_NOT_ALLOWED',
    refused.body,
  );
  psql(`UPDATE users SET "canManageUsers"=${made.noorFlag === 't'} WHERE id='${noor.user.id}'`);
  made.noorFlag = null;
  const noName = await call('POST', '/chat/groups', john.token, { title: '   ', memberIds: [mike.user.id] });
  check('a group without a name is refused (400)', noName.status === 400, noName.status);
  const stranger = await call('POST', '/chat/groups', john.token, {
    title: 'E2E',
    memberIds: [mike.user.id, 'no-such-user'],
  });
  check('a group with somebody unknown is refused, nothing made (403)', stranger.status === 403, stranger.status);

  const created = await call('POST', '/chat/groups', john.token, {
    title: 'E2E Site team',
    memberIds: [mike.user.id, karim.user.id],
  });
  const group = created.data;
  if (group?.id) made.conversations.push(group.id);
  check(
    'John starts "E2E Site team" with Mike and Karim',
    created.status < 300 && ids(group).join() === [john.user.id, mike.user.id, karim.user.id].sort().join(),
    created.body,
  );
  check('the creator may manage it', group?.canManage === true && group?.type === 'GROUP');
  await sleep(500);
  check(
    "Mike's screen is told the list changed",
    mikeS.take('chat.conversationUpdated').some((e) => e.conversationId === group?.id),
  );
  const first = await call('GET', `/chat/conversations/${group.id}/messages`, mike.token);
  const createdLine = (first.data ?? []).find((m) => m.kind === 'SYSTEM');
  check(
    'the history opens with a system line naming who was added',
    createdLine?.meta?.event === 'CREATED' && createdLine.meta.users.length === 2,
    first.body,
  );
  check('…which pushed nothing and counted nothing', (await listed(mike, group.id))?.unread === 0);
  check(
    'the system line cannot be edited by its actor (404)',
    (await call('PATCH', `/chat/messages/${createdLine?.id}`, john.token, { body: 'x' })).status === 404,
  );

  const hello = await send(mike.token, group.id, 'E2E hello zwiebelkuchen group');
  check('Mike writes into the group', hello.status < 300, hello.body);
  await sleep(400);
  check("Karim's unread is 1", (await listed(karim, group.id))?.unread === 1);
  check(
    'Mike cannot rename it (403)',
    (await call('PATCH', `/chat/groups/${group.id}`, mike.token, { title: 'Hijacked' })).status === 403,
  );
  const renamed = await call('PATCH', `/chat/groups/${group.id}`, john.token, { title: 'E2E Crew' });
  check('John renames it', renamed.data?.title === 'E2E Crew', renamed.body);
  const added = await call('POST', `/chat/groups/${group.id}/members`, john.token, { userIds: [sarah.user.id] });
  check('John adds Sarah', ids(added.data).includes(sarah.user.id), added.body);
  const removed = await call('DELETE', `/chat/groups/${group.id}/members/${karim.user.id}`, john.token);
  check('John takes Karim out', removed.status < 300 && !ids(removed.data).includes(karim.user.id), removed.body);
  await sleep(500);
  check(
    "Karim's screen is told he was taken out",
    karimS.take('chat.conversationUpdated').some((e) => e.conversationId === group.id && e.removed === true),
  );
  check(
    'Karim can no longer read it',
    [403, 404].includes((await call('GET', `/chat/conversations/${group.id}/messages`, karim.token)).status),
  );
  check('…nor write into it', [403, 404].includes((await send(karim.token, group.id, 'still here?')).status));
  // Typing goes to the members the notification service knows NOW — Karim's is forgotten.
  sarahS.got.length = 0;
  karimS.s.emit('chat_typing', { conversationId: group.id });
  await sleep(400);
  check("Karim's typing no longer reaches the group", sarahS.take('chat.typing').length === 0);
  const left = await call('POST', `/chat/groups/${group.id}/leave`, mike.token);
  check('Mike leaves', left.status < 300 && !(await listed(mike, group.id)), left.body);
  const lines = ((await call('GET', `/chat/conversations/${group.id}/messages`, john.token)).data ?? [])
    .filter((m) => m.kind === 'SYSTEM')
    .map((m) => m.meta.event);
  check('every change is a line in the history', lines.join() === 'CREATED,RENAMED,ADDED,REMOVED,LEFT', lines);

  console.log("\n— B. a job's chat");
  const before = psql(`SELECT status FROM tasks WHERE id='${TASK}'`);
  made.task = {
    status: before,
    assignedToId: psql(`SELECT COALESCE("assignedToId", '') FROM tasks WHERE id='${TASK}'`),
    crew: psql(`SELECT COALESCE(string_agg("userId", ','), '') FROM task_assignees WHERE "taskId"='${TASK}'`),
  };
  check('the seeded job exists and is open', !!before && !['COMPLETED', 'CLOSED', 'CANCELED'].includes(before), before);
  const karimOpen = await call('POST', `/chat/tasks/${TASK}`, karim.token);
  check(
    "somebody not on the job and without the office's view is refused (404)",
    karimOpen.status === 404,
    karimOpen.status,
  );
  const job = await call('POST', `/chat/tasks/${TASK}`, john.token);
  if (job.data?.id) made.conversations.push(job.data.id);
  check(
    "the office opens the job's chat: the crew and the office are in it",
    job.data?.type === 'TASK' && ids(job.data).includes(mike.user.id) && ids(job.data).includes(john.user.id),
    job.body,
  );
  check('it names the job', job.data?.task?.id === TASK && !!job.data?.task?.title);
  const again = await call('POST', `/chat/tasks/${TASK}`, mike.token);
  check('opening it again is the SAME chat', again.data?.id === job.data?.id);
  check('Mike writes into it', (await send(mike.token, job.data.id, 'E2E on site now')).status < 300);

  // Mike is on it by the legacy column only; give him his crew row first, or adding
  // Karim through the picker would make Karim the primary person (syncPrimaryAssignee).
  await call('POST', `/tasks/${TASK}/assignees`, john.token, { userId: mike.user.id, role: 'LEAD' });
  const addK = await call('POST', `/tasks/${TASK}/assignees`, john.token, { userId: karim.user.id });
  await sleep(500);
  check('Karim put on the crew → in the chat', addK.status < 300 && !!(await listed(karim, job.data.id)), addK.body);
  const offK = await call('DELETE', `/tasks/${TASK}/assignees/${karim.user.id}`, john.token);
  await sleep(500);
  check(
    'Karim taken off the crew → out of the chat',
    offK.status < 300 && !(await listed(karim, job.data.id)),
    offK.body,
  );
  check('…and the office stays in it (the crew never removes the office)', !!(await listed(john, job.data.id)));

  psql(`UPDATE tasks SET status='COMPLETED' WHERE id='${TASK}'`);
  const closed = await send(mike.token, job.data.id, 'after the end');
  check(
    "a finished job's chat takes no new message (409 CHAT_TASK_CLOSED)",
    closed.status === 409 && closed.body?.code === 'CHAT_TASK_CLOSED',
    closed.body,
  );
  check('…shows as closed in the list', (await listed(mike, job.data.id))?.isClosed === true);
  check(
    '…and stays readable',
    (await call('GET', `/chat/conversations/${job.data.id}/messages`, mike.token)).status === 200,
  );
  psql(`UPDATE tasks SET status='${before}' WHERE id='${TASK}'`);

  console.log('\n— C. search');
  const hit = await call('GET', '/chat/search?q=zwiebelk', sarah.token);
  check(
    'a prefix finds the word, in a conversation the caller is in',
    (hit.data ?? []).some((h) => h.message.id === hello.data?.id && h.conversation.id === group.id),
    hit.body,
  );
  const miss = await call('GET', '/chat/search?q=zwiebelk', karim.token);
  check(
    'somebody taken out of that conversation finds nothing',
    Array.isArray(miss.data) && miss.data.length === 0,
    miss.body,
  );
  const odd = await call('GET', `/chat/search?q=${encodeURIComponent("zwiebelk:* | !x & ' ) (")}`, sarah.token);
  check('tsquery syntax typed into the box is only letters to the search', odd.status === 200, odd.body);
  const empty = await call('GET', '/chat/search?q=%20%21%20', sarah.token);
  check('nothing searchable is a 400', empty.status === 400, empty.status);
  // Sarah removes her own message — the search never finds it again.
  const mine = await send(sarah.token, group.id, 'E2E quokkaword secret');
  await call('DELETE', `/chat/messages/${mine.data?.id}`, sarah.token);
  check(
    'a removed message is never found',
    ((await call('GET', '/chat/search?q=quokkaword', john.token)).data ?? []).length === 0,
  );
}

main()
  .catch((e) => {
    console.error(e);
    state.failures++;
  })
  .finally(async () => {
    try {
      if (made.task) {
        psql(
          `UPDATE tasks SET status='${made.task.status}', "assignedToId"=${made.task.assignedToId ? `'${made.task.assignedToId}'` : 'NULL'} WHERE id='${TASK}'`,
        );
        const keep = (made.task.crew || '')
          .split(',')
          .filter(Boolean)
          .map((id) => `'${id}'`)
          .join(',');
        psql(`DELETE FROM task_assignees WHERE "taskId"='${TASK}'${keep ? ` AND "userId" NOT IN (${keep})` : ''}`);
      }
      if (made.noorFlag !== null)
        psql(`UPDATE users SET "canManageUsers"=${made.noorFlag === 't'} WHERE id='emp-noor'`);
      for (const id of made.conversations) psql(`DELETE FROM conversations WHERE id='${id.replace(/'/g, '')}'`);
    } catch (e) {
      console.log('cleanup (phase 3) failed:', e.message);
    }
    state.sent = []; // their conversations are gone, messages with them
    await cleanup();
    console.log(state.failures ? `\n${state.failures} FAILED` : '\nall passed');
    process.exit(state.failures ? 1 : 0);
  });
