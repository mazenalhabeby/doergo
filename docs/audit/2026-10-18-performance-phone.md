# Phone app performance audit — 2026-10-18

Scope: `apps/mobile` (src + app). Branch `refactor/code-audit-2026-10`. Static audit plus one bundle
measurement; no device run. Result: the app was already tuned; one small fix, one recommendation.

## Measured

| What | Value |
|---|---|
| iOS JS bundle (`expo export --platform ios`, Hermes bytecode) | **7.2 MB** |
| Source behind it | 12.2 MB: app components 2.5 MB, react-native 2.3 MB, **shared 1.3 MB**, reanimated 0.8 MB, app lib 0.4 MB, expo-router 0.4 MB |
| Home screen requests on open | one ordered load queue (`src/home/load-queue.ts`, `home-load.tsx`): cards ask in order, slower on a weak signal, placeholders hold height — no burst |

## Lists — OK

- Every long list is virtualized: jobs (`jobs-list/use-jobs-screen.tsx:225`, SectionList), approvals, team,
  documents, clients, register, equipment, client requests, support, manage attendance, chat (inverted
  FlatList with `initialNumToRender` / `maxToRenderPerBatch` / `windowSize`, `chat/chat-screen-lists.tsx:106`).
- All 20 FlatList/SectionList uses have `keyExtractor`.
- Rows on live lists are `memo`: JobRow (with a value comparator `sameJobRowProps` for its object props),
  ClientRow, TeamRow, DocumentRow, MessageRow, ConversationRow, ContactRow, WellRow, ImportRow, SentRow.
- Inline `renderItem` on those lists only re-runs the item function; the memo rows bail out. Not changed.
- Left on ScrollView + map: `people/members-screen.tsx:153` (members grouped in wells). Converting means
  re-building the well grouping in a FlatList — a visual risk for an org-sized list (tens of rows). Left.

## Re-renders — one fix

- Context values are memoized in auth, socket, theme, offline (state), location tracking, version, document
  requirements, island.
- **Fixed:** the tour context value (`tour/use-tour-provider.ts`) was a new object every render; now
  `useMemo` over its parts. Its one reader (`tour-launcher.tsx`) re-renders only when a part changes.

## Startup and network — OK

- No polling in the background: `hooks/use-live-refresh.ts:97` asks only while the app is active; resume is
  one throttled event (`lib/app-resume`, 30 s minimum); reconnect catches up once.
- Shift heartbeat every 5 min only while in front (`time/use-shift-watch.ts:96`); the 30 s job arrival
  check reads local storage, not the network (`job/use-job.ts:165`); push ping every 10 min (`app/(app)/_layout.tsx:129`).
- Document requirements are re-read at most once a minute (`contexts/document-requirements-context.tsx:114`).

## Images — OK

- Avatars and remote pictures go through `CachedImage` (expo-image, memory + disk) where the URL is stable.
- Chat and job photos use short-lived signed URLs (a new address on every fetch) — a URL-keyed disk cache
  would not hit; left on React Native's Image.

## Offline engine — OK

- Outbox drains in batches (`offline/sync-engine.ts:144`), with preparation before push; records and outbox
  writes are one transaction each (`db/records-store.ts:70,119`, `db/sqlite-outbox-store.ts:48`). The
  connection opening is untouched (memory: offline-engine-dead-database).

## Recommendation (not done — not an identical-behaviour change)

- **Shared ships whole (1.3 MB source).** Metro does not tree-shake, so the phone carries every module
  behind `@hbcfield/shared/client` — including web/server-only ones (Stripe catalogue, invoice lines,
  document starter templates, report labels). Options: Expo's tree shaking for production bundles, or a
  phone-only entry in shared. Either needs a native-build test (not an OTA) and a device check.

## Verification

Mobile typecheck 0 errors; jest 3,121 passed (4 skipped); size ratchet ok; clones 3.
