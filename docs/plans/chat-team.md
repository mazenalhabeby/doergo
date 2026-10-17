# Chat and Team — the full plan

> Status: **Phases 1 and 2 BUILT LOCALLY, not committed or deployed** (2026-10-15). Migrations `20261015090000_chat_counters` and `20261015150000_chat_phase2` applied to the local DB only. Checks: `node tools/chat-e2e.mjs` (phase 1, API + sockets), `node tools/chat-phase2-e2e.mjs` (phase 2), `node tools/video/chat-web-e2e.ts` (two people in two browsers). Phase 3 is plan.
> Phase 2 left for later, by choice: the web's IndexedDB copy (the web is online; the phone has the offline copy), push grouping per conversation (thread id / collapse key), photos queued offline on the phone (photos need the network), office links (tasks/hours/leave) on the phone profile, and a list virtualiser on the web.
> Phase 1 notes: the badge is one indexed SUM (no Redis needed); typing stays inside the organization (the relay's deliberate rule — §2.5's "across companies" was dropped); the 800-line chat service was split (chat / chat-reach / chat-cross-org / chat-counters). Mockup with Arabic voice-over:
> https://claude.ai/artifact/SapZM1RprKR5s6Hk6g64LM (source `docs/design/chat-team/`).
> Standing rules apply: mockup approved before UI code, web approved on :3000, phone
> previewed in the Expo dev app, OTA only to the 1.0.8 train, deploys batched.

## 0. Where we start (read from the code)

**Chat**
- Text-only 1-to-1. Owned by `apps/api/task-service/src/modules/chat/chat.service.ts`; the gateway only forwards.
- Tables: `Conversation`, `ConversationMember (lastReadAt)` and `Message (attachments Json, editedAt, deletedAt)`.
  - `GROUP` exists as a type but nothing can create one.
- Live updates: socket `chat.message` (to `user:{id}` rooms) and `chat.typing`.
  - Typing goes to the whole org, not only the conversation's members.
- Web is a drawer only.
  - It invalidates both the list and the thread queries on every `chat.message`.
  - No Messages button, no unread badge.
- Phone has a Chat tab, gated on the **`live_chat` add-on** by mistake (`apps/mobile/src/lib/tab-layout.ts:143`).
  - Offline send goes through the outbox (`chat.send`).
- Missing everywhere: photos and files (the DTO refuses them), read receipts, older history, groups, job chats, search, push mute.

**Team**
- Web:
  - `/dashboard`: the live team per workspace.
  - `/team`: a plain grid, offered to managers only.
  - `/members` and `/members/:id`: the admin roster and profile.
- Phone:
  - Team tab: managers + colleagues, live presence.
  - Manage → Members: **capped at 10**, because the list sends no `limit` (`apps/mobile/src/lib/api/admin.ts:90`).
  - No person profile.
- Four people lists with four rules:
  - `/organizations/members`
  - `/locations/team`
  - `/organizations/contacts`: ignores `contactable` and uses the legacy permission columns.
  - `/chat/contacts`

**What we build on (already exists)**
- Socket.IO with the Redis adapter (`notification-service/src/redis-io.adapter.ts`).
- The phone's SQLite records store and the `/sync/pull` cursor protocol (`packages/shared/src/sync/protocol.ts`, scopes today: spaces, workflows, tasks, comments, attachments).
- The outbox with client ids.
- Presigned S3 uploads (task attachments).
- `expo-image-manipulator`, `expo-image` and `expo-sqlite` are in the phone's `package.json`.
- The Redis-cached count pattern (Approvals).
- `afterAssigneesChanged` for crew changes.

## 1. Decisions — defaults used by this plan until you say otherwise

| # | Question | Default in this plan |
|---|---|---|
| D1 | Start phase 1 now? | Yes |
| D2 | Call buttons on the web | **Remove.** Users have no phone-number field today; a plain call would need one. |
| D3 | Who may create a group | Managers and leaders (anyone holding `SPACE_LEADER_PERMISSION` or org-wide `canManageUsers`) |
| D4 | Job chat | Created **on first open** by anyone on the crew (not automatically for every job) |
| D5 | Sending a message: socket or HTTP | **HTTP (one small request).** See §2.3. Everything else rides the socket. |
| D6 | Edit/delete window | 15 minutes, own messages only; delete leaves "Message removed" |
| D7 | Retention on the device | Last 30 days per conversation; older pages fetched on scroll |
| D8 | Web side drawer | **Removed (user, 2026-10-15).** Every Message button, the bell's chat links and the new-message toast open `/messages?with=<userId>` (or `?c=<conversationId>`). `ChatProvider`/`chat-drawer.tsx` go; `useContactActions().message` navigates. |
| D9 | Phone: Team and Chat | **One Team tab with a switch: People \| Messages (user, 2026-10-15).** It opens on Messages when anything is unread, otherwise on the half used last (kept in the phone's preferences). The tab shows the unread number. A push or link opens the conversation directly. The separate Chat tab goes; `/chat` and `/chat?userId|conversationId` keep working as routes into the Messages half. Chosen over a separate Messages tab (the bar is full: Home · Jobs · Clock · Team + More, and Clock cannot move) and over contacts-inside-New-chat (managers need the live "who is free" list). |

## 2. Architecture (the big-app model, adapted)

### 2.1 One live connection for everything that is read
The socket carries `chat.message`, `chat.updated` (one conversation row), `chat.read`, `chat.typing` and `chat.badge`. Every event carries **enough to update the screen with no request**: the full message, the new list row, and the new badge.

### 2.2 A copy on the device, caught up by cursor
- **Phone:** two new pull scopes, `chat_conversations` and `chat_messages`, in `SYNC_PULL_SCOPES`, served by the existing `/sync/pull`.
  - The cursor is `(updatedAt, id)`, so an edit, delete or read change is just a changed row.
  - `scopeIds` on the last page removes conversations the person left.
- **Web:** the same two scopes, kept in IndexedDB (a small store in `lib/chat-store.ts`) and run on load and on socket reconnect.
- Opening the app or a chat = 0 requests + 1 catch-up pull per scope. A reconnect = 1 pull, with only the changes.

### 2.3 Sending stays HTTP, on purpose
- The gateway guard chain is the security boundary: throttle, JWT, CustomerConfinement, ExternalMember, Onboarding, audit.
- A socket send would land in notification-service, which has none of that and no client to task-service. Copying the chain there would be a second door to keep in step.
- The cost of HTTP is one small request per message *sent*, on a kept-alive HTTP/2 connection. The sender's own screen updates from the reply. Everyone else updates from the socket.
- The phone's outbox stays as it is: client id and `sentAt`, with server-side de-duplication.

### 2.4 Stored, not counted
- `Conversation` gains `lastMessageId`, `lastMessageAt` (exists), `lastMessagePreview` (first 140 chars, or "Photo"/"File") and `lastSenderId`.
- `ConversationMember` gains `unreadCount Int @default(0)`, `mutedUntil DateTime?` and `updatedAt`.
- **Send (one transaction):**
  - insert the message;
  - update the conversation's last-message fields;
  - `UPDATE conversation_members SET "unreadCount" = "unreadCount" + 1 WHERE "conversationId" = $1 AND "userId" <> $sender`.
- **Read:** `unreadCount = 0`, `lastReadAt = now()`.
- **Badge:** `SUM(unreadCount)` for the user, cached in Redis under `chat:badge:{userId}` with a 20 s TTL. The cache is dropped on send and on read, and the new number is pushed with `chat.badge`.
- The conversation list is then one indexed query (`conversation_members.userId` → join conversation), with no `messages` include and no unread count.

### 2.5 Typing only to members
- Each conversation's member ids are kept in a Redis set `chat:members:{id}`, written by task-service on create, join and leave (24 h TTL, rebuilt on a miss).
- `chat_typing {conversationId}` is relayed only to those users' `user:{id}` rooms, throttled to 1 per 2 s per sender.
- This also works across companies, because rooms are per user, not per org.

### 2.6 Files go straight to storage
- `POST /chat/conversations/:id/attachments/presign {name, mime, size}` checks membership and that the thread is not closed. It returns a PUT URL for the key `chat/{orgId}/{conversationId}/{uuid}`.
  - Allow-list: images, PDF and Office files. Max 20 MB per file, max 5 per message.
- The phone resizes a photo to 1600 px (JPEG 0.8) and also uploads a 320 px thumbnail. The web does the same with a canvas. The server never processes image bytes.
- The message stores `[{key, thumbKey?, name, mime, size, w?, h?}]`; the DTO refusal (`@ArrayMaxSize(0)`) is lifted.
- `POST /chat/attachments/urls {messageIds}` mints short-lived GET links in one batch, after a membership check, and the client caches them until expiry. No list ever returns a URL (same rule as documents and receipts).

### 2.7 Push only when it helps
- The socket tracks `chat_viewing {conversationId|null}` per connection. If a recipient is viewing that conversation, no push is sent.
- Pushes carry `threadId` / collapse key = conversationId, so they stack per conversation.
- `mutedUntil` on the member row, and a new `chat` category in `memberWantsPush`, so a person can switch chat pushes off.

### 2.8 One rule for "who can I contact"
- `chat.service.canReach` stays the single rule.
- It is exposed as `contactableIds(userId)`, cached in Redis for 60 s and dropped on any role, space or share change. The existing re-check on every send stays.
- `/locations/team`, `/organizations/contacts` and the profile return `canMessage` per person.
  - Message buttons show only when it is true.
  - `listOrgContacts` starts reading `contactable`.
- The lists stay different on purpose. Who you SEE follows the existing rules; the Message button follows one rule.

## 3. Phase 1 — quick fixes + the four big speed wins (≈ 1 week)

**Server**
1. Migration `…_chat_counters` (additive): the conversation's last-message fields, and the member's `unreadCount`, `mutedUntil` and `updatedAt`.
   - Backfill `unreadCount` from the current count query and the last-message fields from the newest message.
   - Index `conversation_members(userId, updatedAt)`.
2. `sendMessage` / `markRead` write the counters in their transactions (§2.4). `listConversations` reads stored fields only.
   - Extend `chat.query-budget.spec.ts`: the list = 2 queries, whatever the thread count.
3. Socket events carry the full payload:
   - `chat.message {message, conversation, badge}`
   - `chat.updated {conversation}`
   - `chat.badge {total}`
   - Emit the dormant `CHAT_CONVERSATION_UPDATED` as `chat.updated`.
4. Typing via `chat:members:{id}` (§2.5). Update `chat-typing.spec.ts`: a non-member gets nothing, and a cross-company member gets it.
5. `GET /chat/badge` → `{total}` (Redis-cached) for first paint.

**Web**
6. Chat drawer: on `chat.message` / `chat.updated`, patch the React Query caches with `setQueryData`, never `invalidateQueries`. A spec asserts the handler never invalidates.
7. Top bar: a Messages button with an unread badge (`chat.badge` + `GET /chat/badge`) that opens the drawer on the list. Wire up the unused `openMessages`.
8. Remove the "Calls are coming soon" buttons (drawer, `/team`). Applies D2.

**Phone (JS only → OTA 1.0.8 after preview)**
9. `tab-layout.ts`: `chat: canContactColleagues(u)`, without `live_chat`. Fix the stale comments in `tab-layout.ts`, `notification-route.ts` and the `(tabs)/_layout.tsx` comment.
9a. **One Team tab (D9):** `team-screen.tsx` gets a People | Messages switch at the top and renders `chat-screen.tsx`'s list in the Messages half.
    - Remove the Chat tab from `(tabs)/_layout.tsx` and `TAB_PRIORITY`.
    - `/(app)/(tabs)/chat` becomes a redirect into Team → Messages (it is kept for old pushes and links).
    - Open on Messages when `chat.badge > 0`, else on the last half used (saved in preferences).
    - The tab shows the unread number. Inside a conversation the tab bar hides, as today.
    - Update `notification-route.ts` and `notification-routes.spec.ts`; add a tab-layout spec (no Chat tab, Team has the badge).
10. Manage → Members: page through `/organizations/members?page&limit=50` with infinite scroll, a real total count, and server-side search.
11. Apply `chat.message` payloads in place (already mostly done); read `chat.badge` for the Team tab and the Messages half.

**Checks:** all chat specs, the new specs, and `tools/chat-e2e.py` (new, LOCAL, signs out every session): send → list row + badge update with no list refetch; typing is not leaked; the members list shows more than 10.

## 4. Phase 2 — the big-app foundation + better chat (≈ 2–3 weeks)

**Foundation**
1. Sync scopes `chat_conversations` and `chat_messages` on `/sync/pull`. Server reader in task-service `modules/sync`.
   - Messages: in the caller's conversations, `updatedAt > cursor`, last 30 days (D7).
   - Index `messages(conversationId, updatedAt, id)`.
   - `Message.updatedAt` is added and set on edit and delete.
2. Phone: the records store holds both scopes. The chat screen reads SQLite first and pulls on focus, on resume and on socket reconnect. The outbox overlays waiting messages (as for comments).
3. Web: an IndexedDB copy (`lib/chat-store.ts`) with the same scopes, pulled on load and on reconnect. The drawer and page read from it.
4. Older history: `GET …/messages?before=<sentAt>|<id>` uses a `(createdAt, id)` cursor, so messages in the same millisecond are never skipped. Infinite scroll up.
   - Web: `@tanstack/react-virtual` for the stream.
   - Phone: an inverted `FlatList` with `maintainVisibleContentPosition`.

**Features**
5. `/messages` page on the web: list · conversation · person panel (as in the mockup). The drawer is removed (D8); in phase 1 the top-bar button opens the existing drawer's list, in phase 2 everything moves to the page.
6. Photos and files (§2.6) on both apps.
   - Phone: camera + gallery through the existing image picker hook.
   - ⚠️ Confirm that `expo-image-manipulator` is in the **1.0.8 binary** before the OTA. If not, ship this part with the next build.
7. Read receipts:
   - The conversation row carries the members' `lastReadAt`.
   - 1-to-1 shows "✓ Sent / ✓✓ Read"; a group shows "Seen by N".
   - `chat.read {conversationId, userId, at}` is sent to the members.
8. Edit and delete (D6). `deletedAt` messages come back as a tombstone with no body; history and the pull both respect it.
9. Push (§2.7): no push while viewing, collapse per conversation, mute per conversation (a menu in the thread), and a `chat` category in the push settings.
10. Contact rule (§2.8): `canMessage` on team and contacts rows, and `listOrgContacts` reads `contactable`.
11. Team on the web:
    - `/team` becomes the directory: managers first, live presence (subscribe to `PRESENCE_CHANGED`, add `presence` to the `Colleague` type), search, presence filters, and Message and Profile on each card.
    - The menu is offered to every non-external member (`NAV_OFFER['/team']`).
    - `/members/:id` gets a Message button.
    - The dashboard gets a people search box.
12. Profile on the phone: route `(app)/person/[id]`, backed by a new `GET /people/:id`.
    - It returns name, position, presence, today's workspace and shift, leader, and `canMessage`, under the "can see in Team" rule; anything else is a 404.
    - Office people see links to the existing tasks, hours and leave screens.
    - Team rows open it.
13. Offline presence: the Team tab stops serving cached presence. It shows "—" offline, as the Crew widget does.

**Checks:** a pull spec (cursor, edits, tombstones, scope removal), an attachment authorisation spec (a non-member is refused, a closed thread refuses uploads, no list carries a URL), a receipts spec, a push-suppression spec, and extended `tools/chat-e2e.py` (photo round trip, receipt, offline send then catch-up).

## 5. Phase 3 — groups, job chat, search (≈ 2–3 weeks)

> **BUILT LOCALLY 2026-10-16 — not committed, not deployed.** Migration `20261016090000_chat_groups_tasks_search` (additive; local DB only). E2E: `node tools/chat-phase3-e2e.mjs` (LOCAL, 39 checks; restores the job and deletes what it made).
> Decisions as built: D3 = org-wide `canManageUsers` or the space-leader permission, **never an external member**; a group is one company's (no external people in it). D4 = created on first open; members `CREW` (follow `afterAssigneesChanged` — the crew is assignee rows ∪ `assignedToId`; crew join/leave is presence, not membership) and `OFFICE` (re-gated by the job gate on every read and write, removed when it fails; the crew never removes them). Over = the flow's `isFinal`/`isCanceled`, else COMPLETED/CLOSED/CANCELED (`taskChatClosed`) → 409 `CHAT_TASK_CLOSED`.
> System lines are messages (`kind = SYSTEM`, `meta` = names snapshot): no unread, no push, never editable (404), the apps write the sentence (`chatSystemLine`). Member changes → `chat_members_changed` → the socket's member cache forgets the thread + `chat.conversationUpdated {removed}`.
> Item 4 (prefetch on Wi-Fi) needed nothing new: phase 2's `chat_messages` pull already keeps the last 30 days of every conversation on the phone. Phone search is ONLINE ONLY (said on screen).

1. Groups (D3):
   - `POST /chat/groups {title, memberIds}`: the creator must be able to reach every member at creation.
   - Rename, add or remove members (creator and admins), and leave.
   - System messages for each change.
   - The member set in Redis and the pull `scopeIds` follow every change.
2. Job chat (D4):
   - `Conversation.taskId` is unique.
   - "Chat" on the job page (web and phone) opens or creates it for the crew.
   - Membership follows the crew in `afterAssigneesChanged` and on crew join/leave. The office opens it read/write through the normal task gate.
   - When the job is finished or cancelled, the chat stays readable and closed to new messages.
3. Search: a generated column `search tsvector GENERATED ALWAYS AS (to_tsvector('simple', body)) STORED` + a GIN index.
   - `GET /chat/search?q` searches only the caller's conversations and skips deleted messages, with paged results.
   - On the phone it is online only.
4. Instant open on the phone: already given by phase 2. Here we add prefetching the newest 30 messages of the top 10 conversations on Wi-Fi.
5. `tools/chat-e2e.py` covers groups, job chat membership following the crew, and search scoped to membership.

## 6. Security rules that must hold (tests pin each one)

- A CUSTOMER account is never in team chat. The Messaging switch per person is absolute.
- Reach is re-checked on every send. The reply right stays. Cross-company threads close when the share ends; once closed, no sends and no uploads.
- Typing, read and viewing events reach members only.
- Attachment links are minted per request, after a membership check, and are short-lived. No list returns a URL.
- Group creation checks reach to every member. A job chat never adds anyone who is not on the crew.
- Search, pull and history are always filtered by membership. Refusals are 404, never 403.

## 7. Speed targets (measured before each deploy)

| Measure | Today | Target |
|---|---|---|
| Requests per incoming message, per open web screen | 2 | 0 |
| Conversation list queries | 3+ (plus all members of 100 threads) | 2 |
| Open the chat screen (phone) | 2–3 requests, waits on network | 0 before first paint, 1 pull per scope |
| Reconnect after sleep or no signal | reload everything | 1 pull, only changes |
| p95 send → seen by the other person (same region) | not measured | < 300 ms |

## 8. Deploy and rollout

- Each phase is one batched deploy, after your approval on :3000 and in the Expo dev app.
- **Migrations:** phase 1 `chat_counters`; phase 2 `chat_message_updated_at` + indexes; phase 3 `chat_groups_tasks_search`. All additive, with a backup + table count before each.
- **Services:**
  - task-service, gateway and notification-service every phase;
  - web-app every phase, followed by `infra/sync-static.sh`;
  - auth-service in phase 2 (contacts).
- **Phone:** each phase is JS only → OTA 1.0.8 only, with `EXPO_PUBLIC_API_URL` inline. The one native question is `expo-image-manipulator` in the 1.0.8 binary (phase 2, item 6).
- Old phones keep working throughout: endpoints only gain fields; the old list and history routes stay.

## 9. Out of scope

- The customer portal's Messages tab (a separate portal ↔ office thread).
- Voice and video calls.
- End-to-end encryption: the company must be able to see its work chats.
- Deleting messages after delivery.
