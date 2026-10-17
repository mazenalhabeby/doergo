# Chat code audit: size, SOLID, DRY

> 16 Oct 2026. Scope: all chat, socket and unread-count code on the server, web, phone and
> shared package (Phases 1–3, today's live-update fixes, the premium phone UI).
> **Audit only: nothing is refactored yet.** The plan in §4 waits for your go.

## 1. How it was measured

- **Size:** lines per file, and lines longer than 140 characters (prettier's usual width plus a
  margin). The repo has no prettier config, so the 140 rule is proposed in §5.
- **Duplication:** `jscpd` with the repo's own settings (≥ 12 lines, ≥ 80 tokens; tests,
  migrations, locales excluded), plus a manual read for duplicates jscpd can't see (the same rule
  written twice in different words).
- **SOLID:** each file read for "how many jobs does it do?" (single responsibility) and "does a
  screen know how the data is fetched?" (dependency direction).

## 2. Results at a glance

| Check | Result |
|---|---|
| Copy-paste clones (jscpd), whole repo | **7 small clones, none in chat**. All are in older files: time-off, client requests, consent modal, e2e tests |
| Chat files over 200 lines | **8** (server 4, phone 4) |
| Lines over 140 chars in chat code | **~230**, mostly phone UI (`chat-screen` 33, `chat-rows` 26, `group-panel` 21, `chat-group-views` 15, `team-messages` 14) |
| Same logic in web and phone | **4 rules** (§3.2) |
| Dead code | **4 unused glyphs** (`GroupGlyph`, `JobChatGlyph`, `BellGlyph`, `FileGlyph`) |

## 3. Findings

### 3.1 Files doing too many jobs (Single Responsibility)

| File | Lines | Jobs it does today | Split into |
|---|---|---|---|
| `mobile/components/chat/chat-rows.tsx` | 258 | conversation avatar, conversation row, contact row, day pill, system line, ticks, message bubble, tag, send button | `conversation-avatar`, `conversation-row`, `contact-row`, `message-bubble` (+ day pill, ticks), `system-row`, `send-button`, `tag` |
| `mobile/components/chat/chat-screen.tsx` | 271 | route params, 5 views, contacts list, thread list, receipts, empty state, header switch | `chat-screen` (routing + view switch only), `thread-view`, `contacts-view`, `empty-conversation`, `receipt.ts` |
| `mobile/components/chat/chat-group-views.tsx` | 191 | people picker, new group, add people, group info | `pick-people`, `group-create-view`, `add-people-view`, `group-info-view` |
| `mobile/components/people/team-messages.tsx` | 207 | list loading, socket updates, local search, server search, search results UI | `team-messages` (list), `use-conversation-list` (load + live), `use-message-search`, `message-search-results` |
| `mobile/components/chat/use-chat-thread.ts` | 192 | open, history pages, socket subscriptions, focus/read rules, send/edit/remove | `use-chat-thread` (state + actions), `use-thread-live` (socket), `use-thread-read` (focus + read) |
| `mobile/hooks/useSocket.ts` | 223 | connection, single-attempt guard, auth retry, handler registry, NetInfo, AppState | `socket-registry.ts` (pure, testable), `useSocket` (lifecycle only) |
| `task-service/chat/chat-reach.service.ts` | 423 | contact directory, contact rule, space targets, reply right, cross-org send check, **group rules** | keep the contact rule; move group rules to `chat-group-policy.service.ts` (reuses the rule through one public `canReach`) |
| `task-service/chat/chat.service.ts` | 309 | open DM, list, history, presign, mute, send, read | move `openDirect` (cross-org anchoring) to `chat-direct.service.ts` |
| `web/components/chat/group-panel.tsx` | 143 (21 long lines) | panel, rename form, member list, add-people mode | `group-panel` + `group-members` + `group-rename` |

### 3.2 The same rule written twice (DRY)

| Rule | Where | Fix |
|---|---|---|
| Time "18:32" and day label "Today / Yesterday / 14 Oct" | `web/chat/chat-format.ts` **and** `mobile/chat/chat-format.ts` | one `packages/shared/src/chat/format.ts` (`chatTime`, `chatDayLabel`, `chatWhenShort`), both apps import it |
| Presence wording ("Active now / Busy / Away / Offline") | `presenceLabel` (web) **and** `presenceText` (phone) | one shared `presenceKey → i18n key` map |
| Bubble grouping (new day, grouped, last of run, system line stands alone) | `mobile/live-thread.bubbleShape` **and** inline in `web/message-bubble.tsx` | move `bubbleShape` to shared; the web bubble uses it |
| The red/jade **count** pill | phone tab `Badge`, `ChoicePill` count, conversation-row unread | one `CountBadge` in `amazen` (variants: `alert` red, `quiet` jade), used by all three |

Also checked and **fine** (one source already): unread live updates (`chat/live.ts`), mark-read
(one helper per app, guarded by a test), the contact rule (server only), icons (`shared/icons`),
reach, membership, system lines.

### 3.3 Dependency direction (SOLID "D")

- Phone screens call `chatApi` directly in 6 places (contacts, open, capabilities, search, groups).
  Keep the API client as the boundary, but put the **calls a screen makes** behind hooks:
  `useContacts`, `useChatCapabilities`, `useGroupActions`. Then screens don't know the transport,
  and the offline and caching rules sit in one place.
- `GlobalChatNotifier` lives inside `app/(app)/_layout.tsx` (385 lines). Move it to
  `components/chat/global-chat-notifier.tsx`.

### 3.4 Long lines

Mostly inline style objects and long JSX props on one line. Fix by:
- named style constants per component (`const s = styles(amazen)`), and
- one prop per line when there are more than three.

No logic changes.

## 4. Refactor plan (behaviour must not change)

Each step: move code, no behaviour change, tests green, then the next step.

1. **Shared rules first:** `chat/format.ts`, presence map, `bubbleShape` → `packages/shared`.
   Web and phone import them; delete the copies. Add unit tests in shared.
2. **Phone UI split:** `chat-rows` → 7 files; `chat-screen` → 5; `chat-group-views` → 4;
   `team-messages` → 4; `CountBadge` in amazen. Delete the 4 dead glyphs.
3. **Phone logic split:**
   - `use-chat-thread` → 3 hooks
   - `useSocket` + `socket-registry` (with unit tests: one connect at a time, stale socket ignored, a throwing handler doesn't starve others)
   - `GlobalChatNotifier` to its own file
   - data hooks for screens
4. **Server split:** `chat-group-policy.service.ts` (from reach), `chat-direct.service.ts` (from
   chat service). Specs move with them.
5. **Web:** `group-panel` → 3 files; the bubble uses shared `bubbleShape`; formatting from shared.
6. **Lines:** wrap anything over 140 in the touched files.

**Targets after the refactor:**
- no chat file over 200 lines (most under 120)
- no line over 140 in chat code
- jscpd still 0 in chat
- phone (3,089), web (2,018), server (93 chat) tests all green
- the three chat e2e scripts pass

## 5. Guards so it stays this way

- `chat-structure.spec.ts`: fails if any file under `*/chat/` exceeds 200 lines or has a line over 140.
- Extend the existing jscpd run to CI-style `pnpm dry:check` (the settings above), failing on any new clone.
- The mark-read guard (already added) stays.

## 6. Out of scope (bigger, older files, noted only)

| File | Lines |
|---|---|
| `notification-service/websocket/websocket.gateway.ts` | 1,184 |
| `mobile/components/job/job-page.tsx` | 712 |
| `web/members/[id]/page.tsx` | 739 |
| `gateway/organizations.controller.ts` | 663 |

They predate this work. Worth the same treatment later, one at a time.
