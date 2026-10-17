# Mobile app audit — SOLID, size, long lines, DRY (apps/mobile, 2026-10-16)

Scope: `apps/mobile/src` + `apps/mobile/app` (640 files, 74 > 300 lines, 19 > 500, ~1,570 non-test lines > 140 chars).
Read in full or outlined: route-planner, job-page, (tabs)/_layout, (app)/_layout, lib/api/client.ts, manage/attendance,
use-client-record, issue-thread-sheet, clock-out-sheet, crew-card, shift-clock-card, my-work-card, asset-expense, asset-log,
home-screen, sign-document, use-job-writes, sync-engine, equipment-screen, profile-screen, the whole chat folder,
people/team-messages, hooks/useSocket. No code was modified.

Ground rules that every split below must respect (from CLAUDE.md + memory):
- No Reanimated layout animations (`entering=`/`exiting=`/`layout=`). The current code complies: the only matches are the
  warning comment in `amazen/motion.tsx:18` and two specs. `Arrive` is style-only, so it is fine to reuse.
- `src/components/amazen/index.ts` is a primitives-only barrel. Anything that owns a gesture is imported by path
  (see the comment at index.ts:20-40). New primitives proposed here hold no gestures, so they can go in the barrel.
- **Source-reading specs pin file contents.** Specs that read the source of the files to be split:
  job-page.tsx 12, my-work-card 9, home-screen 9, (tabs)/_layout 8, crew-card 7, lib/api/client.ts 7,
  clock-out-sheet 4, manage/attendance 4, issue-thread-sheet 3, chat-screen 2, (app)/_layout 2, use-client-record 2.
  Every split has to repoint these specs. The better fix is to have them read a directory, not a single file.
- Everything proposed is JS/TS only, so it is **OTA-safe on the current runtime train**. Nothing needs a native build. The
  usual process still applies: preview in the Expo dev server first, and never OTA to an older runtime train.

---

## 1. The large files — what each one does, and how to split it

### 1.1 `app/(app)/route-planner.tsx` — 782 lines (9 long)
What it does today:
- **Data:** offline-first task load with outbox overlay (70-91), then the `tasksApi.list` fallback (81).
- **Location:** `locateMe` (105-111), plus a second fix in `resumeRoute` (267-299).
- **Plan persistence:** restore the saved plan and judge it stale (121-147).
- **Nav-app detection, choice and launch:** 196-233.
- **Remaining stops:** 243-256.
- **Map framing:** 317-341.
- **Presentation:** MapView with polylines and pins (354-413); three floating buttons with copied inline styles (417-431);
  the sheet header with two CTAs (441-508); the FlatList (516-565); the app chooser sheet (572-604);
  `LegRow` (610) and `PickRow` (641).
- **Styles:** 120 lines of legacy `COLORS/SPACING` StyleSheet (660-781).

Findings:
- It **duplicates `src/components/home/use-route-day.ts`**: `detectNavApps` + `rememberedNavApp` + `preferredNavApp`
  (use-route-day:58-65), `isStalePlan` on a restored plan (:70-76), `planDay` (:90) and `Linking.openURL` (:109).
  The comment at 157 says "ONE implementation with the home's route card", but only `planDay` is actually shared.
- Dead code: the `navApp` state at line 46 is written (`setNavApp` at 204 and 588) but never read. The `navChip` style
  (774-777) is unused.
- It is still on the legacy style system (`COLORS`, `SPACING`, `useTheme().colors`) and not on amazen.

Split, target ≤ 250 lines per file:
- `components/route/use-route-planner.ts` (~150): tasks load, selection, start, optimize, restore. Build it on top of
  `use-route-day`'s nav-app and stale-plan parts by extracting `useNavApps(memberId)` and `useRestoredPlan(...)`
  into `components/route/` so the home card and this screen share one code path.
- `components/route/route-map.tsx` (~110): MapView, polylines, origin dot, `StopPin`.
- `components/route/map-fab.tsx` (~40): one round floating button, replacing the three copies at 418, 422 and 427.
- `components/route/route-sheet-header.tsx` (~90): title, meta line, estimate note, CTA.
- `components/route/leg-row.tsx` and `pick-row.tsx` (~50 each).
- `components/route/nav-app-chooser.tsx` (~50). The home card's app menu at route-card.tsx:240-252 could use it too.
- `app/(app)/route-planner.tsx` (~120): composition only.

### 1.2 `src/components/job/job-page.tsx` — 712 lines (15 long)
What it does today:
- **Imports:** 70 lines of them.
- **Sheet state:** `sheetOf` (75).
- **Modal shell animation:** slide/overlay `Animated` (148-167) and `shell()` (241-264).
- **Lazy section loading on scroll:** `seenTo`/`activityY`/`reportY`/`submissionsY` plus `check`/`onScroll`/`at` (214-237).
- **Loading and error screens:** 266-284.
- **~130 lines of derived decisions:**
  - status and dock mode (288-311)
  - the clock-in gate `mustClockInFirst` (326-331)
  - `go`/`pick` navigation between steps (339-370)
  - dock primary (374-400)
  - timer wording (409-421)
  - closed text (422)
  - facts list (427-437)
  - blocked reason from events (440-446)
  - checklist, signature and report flags (452-470)
- **Render:** the page (475-~610) and **eleven sheets** (612-712).

Split:
- `job/use-sheet-slide.ts` (~40): the slide/overlay animation and `close`. The same open/close idea is in `slide-sheet.tsx:39`.
- `job/use-seen-sections.ts` (~50): the scroll-triggered lazy loads. Generic: `useSeenOnScroll({ activity, report, submissions })`.
- `job/job-page-model.ts` (~180, **pure**): `jobPageModel(task, steps, user, crew, jobTime, t)` returns
  `{ mode, decision, primary, timer, closedText, facts, blockedReason, flags }`. This joins `job-logic.ts`, which already
  holds the rules. It can be unit-tested without rendering, and the source specs can assert on it instead of on JSX.
- `job/use-job-actions.ts` (~90): `go`, `pick`, `resume` and the clock-in gate.
- `job/job-sheets.tsx` (~110): the 11 sheets (612-712), driven by `sheet` and `setSheet`.
- `job/job-page.tsx` (~170): shell plus sections.
- Risk: 12 source specs (`job-page-source.spec.ts` and others) read this file.

### 1.3 `app/(app)/(tabs)/_layout.tsx` — 540 lines (0 long)
About half of it is comment blocks.
- `HeaderLogo` (37).
- `presenceColor` (47-51). This is a duplicate; see §2.12.
- `ProfileButton` (55-98): a hand-rolled `Animated.spring` press scale, which is what `PressableScale` already does, plus
  its own avatar and presence dot.
- `CustomTabBar` (111-214).
- `TabsLayout` (216-453): screenOptions and 11 `Tabs.Screen`s.

Split:
- `components/tabs/profile-button.tsx` (~50): use `PressableScale` and the shared `Monogram`/`PresenceDot` (§2.5).
- `components/tabs/custom-tab-bar.tsx` (~90).
- `lib/tab-screen-options.ts` (~60): the spring transition spec and header styles, as a function of colors.
- `_layout.tsx` (~200): screens only. Move the long rationale comments to `docs/` or trim them to one line each with a link.

### 1.4 `app/(app)/_layout.tsx` — 385 lines
- `OWN_HEADER_SCREENS` list (55-94).
- `usePresencePing` (103-153), which calls `trackingApi.updateLocation` from inside the layout.
- `GlobalChatNotifier` (155-182).
- `AppLayout` (184-): notification-response routing and pending targets (200-330), then providers and the Stack.

Split:
- `hooks/use-presence-ping.ts`.
- `components/chat/global-chat-notifier.tsx`.
- `lib/push-routing/use-notification-routing.ts` (the 259-330 effects: crew join, calendar actions, auto-clock actions,
  pending target).
- `lib/own-header-screens.ts`.
- `_layout.tsx` drops to about 130 lines.

### 1.5 `src/lib/api/client.ts` — 488 lines
- URL and media helpers (42-78).
- Response observers (89-121).
- Token store and session owner (80-243).
- Auth callbacks (244-260).
- The refresh state machine (261-360).
- `phoneFetch` (361-389).
- Error toasts (396-409).
- Cache hooks and the `createApiClient` wiring (410-488).

Split, keeping `client.ts` as a re-export so the 7 specs and all importers keep working:
- `api/token-store.ts` (~170)
- `api/session-refresh.ts` (~110)
- `api/response-observers.ts` (~35)
- `api/phone-fetch.ts` (~50)
- `api/client.ts` (~110)

Risk: low, since nothing moves behaviour. It is the auth core, so run the refresh specs.

### 1.6 `app/(app)/manage/attendance.tsx` — 637 lines
- 14 `useState`s.
- Segment, period, custom range and search state (95-113).
- A paginated feed engine: `fetchPage`, `setFeed`, `load`, `loadMore`, `show` (140-217).
- The list and its empty state (474-510).
- `AttendanceEditSheet`.
- Date helpers (571-600).

Split:
- `hooks/use-paged-feed.ts`, generic. The same hand-rolled `loadingMore`/`page` logic is in `clients/clients-screen.tsx`
  and `register/register-screen.tsx`.
- `manage/attendance/period-filter.tsx`.
- `manage/attendance/attendance-row.tsx`.
- Move the date helpers into `lib/app-dates`, which already exists.

### 1.7 `src/components/customer/record/use-client-record.ts` — 635 lines (a hook)
17 states and 13 `customersApi` calls. It holds tabs, load, three refreshers (178-215), activities (toggle, add, heading,
tags; 419-510), the client patch (520-553) and contact links (565-620).

Split:
- `use-client-record.ts` (orchestrator, ~150)
- `use-client-activities.ts` (~180)
- `use-client-contacts.ts` (~150)
- `client-record-text.ts` (pure `headingFor`/`tagsFor`/`relTime`)

### 1.8 `src/components/issues/issue-thread-sheet.tsx` — 625 lines (34 inline style objects)
- Load, send with photos, status actions (`shiftIssuesApi` at 109, 174, 382, 402, 484).
- An end-with-reason sub-flow.
- A photo viewer.
- `Note` (526) and `Bubble` (565).
- The comment at ~204 explains it avoids `<Modal>`, but **`<Modal>` is still in the file**; this needs a check.

Split:
- `use-issue-thread.ts` (data and actions).
- `issue-status-actions.tsx`.
- Reuse the shared thread bubble and composer (§2.9).

### 1.9 `src/components/clock-out-sheet.tsx` — 613 lines (41 inline style objects)
- The main sheet (72-322).
- `OpenJobs` (323), `Hero` (398), `Bar` (427), `Hatch` (481), `Receipt` (507), `Row` (577), `Strip` (594).

Split:
- `clock-out/` folder: `clock-out-sheet.tsx` (~220), `clock-out-bar.tsx` (Bar + Hatch), `clock-out-receipt.tsx`, `open-jobs.tsx`.
- `Row` becomes the shared `FactRow` (§2.2).

### 1.10 `src/components/home/crew-card.tsx` — 607 lines (33 long, 57 inline style objects)
- The card (38-180).
- `Rail` (209), `TileView` (305), `RingSvg` (375), `ScopeFade` (404), `ScopeRings` (442), `RingButton` (492),
  `Message` (579), `ExceptionRow` (594).
- `ringInitials` (486) duplicates `personInitials`.

Split into `home/crew/`: `crew-rail.tsx`, `crew-tile.tsx`, `scope-rings.tsx`, `crew-card.tsx` (~170).
The pure part is already in `crew-state.ts` (528 lines). That file is pure but large; split it into `crew-bands.ts`
(bandOf/ringOf/minutesOf) and `crew-people.ts` (crewPeopleFrom/needsBySpace/crewAsOf).

### 1.11 `src/components/home/my-work-card.tsx` — 573 lines (26 long, 7 `useEffect`s, 2 direct api calls)
- The card (43-380).
- `ActiveRow` (382), `PlainRow` (430), `ShiftList` (461), `Figures` (517), `Sentence` (539).
- Pure text helpers: `dayEyebrow` (551), `nextJobLine` (559), `siteLabel` (568).

Split:
- `use-my-work.ts` (effects and data).
- `my-work-rows.tsx`.
- Move the text helpers into the existing `home/my-work.ts`.
- Card target is ~200 lines.

### 1.12 Others over 500 lines
- `shift-clock-card.tsx` 574: the view is 100-574. Split the pieces of `ShiftClockCardView`.
- `asset-expense.tsx` 568:
  - Camera stage, review stage, two presign+PUT paths (233, 325) and the `Field` "FOUND/CHECK" component (523).
  - Split: `use-receipt-capture.ts`, `receipt-review.tsx`, plus the shared `ReadField` (§2.13).
- `home/home-screen.tsx` 536: drag list, edit mode, load queue, viewability (99-369). Extract `use-home-rows.ts` and
  `use-home-refresh.ts`. Keep the gesture component outside the amazen barrel.
- `sign-document.tsx` 536: read → consent → sign steps with 5 `documentsApi` calls (116-164) in the screen.
  Extract `use-sign-document.ts` (~120) and one component per step.
- `use-job-writes.ts` 530: `refusalMessage` (49) and `trackRouteFor` (63) are pure, so move them to `job-logic`/`lib`.
  The rest is one write per action; split by area: status, files, checklist.
- `offline/sync-engine.ts` 523: `flush()` alone is 220-370 (150 lines). Extract `push-batch.ts` (send, settle, back-off)
  and keep the class at about 300 lines.
- `equipment-screen.tsx` 445: 42 long lines, 7 api calls, a local `Fact` (378).
- `profile-screen.tsx` 463: 25 long lines; local `Group`/`Row` duplicate `settings-ui`.

### 1.13 Chat folder and Team → Messages
File sizes are fine (≤ 271). The problems are density and repeated fetching.

`chat-screen.tsx` (271, **33 long lines**, mostly 145-217):
- It opens from 4 kinds of params (push 74-80, user 95-101, task 85-92, new); each is an effect calling `chatApi` directly.
- It holds the contacts view (140-153), the thread FlatList with a 6-prop-per-line `MessageRow` (160-180), the composer
  wiring with typing emit inline (184-192) and the closed notice (193-201).
- Split:
  - `use-chat-entry.ts` (the param → open logic)
  - `chat-contacts-view.tsx`
  - `chat-thread-view.tsx`
  - `chat-closed-notice.tsx`
  - `use-typing-emitter.ts`
  - `receiptFor` moves to shared (§3)

`team-messages.tsx` (207):
- `useMessageSearch` is defined inline (27-41); move it to `chat/use-message-search.ts`.
- The search-hits block is 135-165; make it a `SearchHits` component.
- The list load, the offline seed (84-89), the reconnect re-read (95-99) and 4 socket subscriptions (101-117) together
  are a `useConversations()` hook.

The list is fetched in **three places**: `chat-screen.tsx:76`, `use-chat-thread.ts:121` and `team-messages.tsx:73`.
Contacts are fetched in two: `chat-screen.tsx:103` and `chat-group-views.tsx:38`.
Fix: `chat/use-conversations.ts` (list + live socket patches + offline seed) and `chat/use-chat-contacts.ts`.
`chat-group-views.tsx` makes 6 direct `chatApi` mutations (69, 96, 135, 139, 143); give it a `use-group-actions.ts`.

`hooks/useSocket.ts` (222) is sound: a single-flight connect and an app-level handler registry.
Callers repeat two patterns:
- An array of `subscribe(...)` calls, then `offs.forEach` in cleanup: use-chat-thread.ts:101-133, team-messages.tsx:101-117,
  support.tsx:153-170, use-job.ts (4 subscriptions), use-jobs-list.ts (4).
- The "re-read when the socket comes back" `wasAuthed` ref: use-chat-thread.ts:145-148, team-messages.tsx:95-99.

Fix: add `useSocketEvents({ [event]: handler }, deps)` and `useOnSocketReconnect(cb)` to `hooks/`.

---

## 2. Repeated UI and logic patterns — one component or hook each

Primitives go in `src/components/amazen/`, with no gestures.

| # | Pattern | Copies (file:line) | Replace with |
|---|---|---|---|
| 2.1 | **Count badge** (min-width circle, 9+ / 99+ cap) | amazen/disc.tsx:110 (99+), amazen/filter.tsx:59-63 (9+), amazen/tab-pill/tab-slot.tsx:340 (9+), home/shortcuts-card.tsx:168-174 (`Badge`, 9+), chat/chat-rows.tsx:69-72 (no cap), app/(customer)/(tabs)/index.tsx:121 (legacy StyleSheet, 9+) | `amazen/count-badge.tsx` `<CountBadge n cap={9\|99} tone ring? />`, with the cap rule in one place |
| 2.2 | **Label → value fact row** | equipment-screen.tsx:378 `Fact`, documents-screen.tsx:378 `Fact`, customer/record/record-about.tsx:151 `Fact`, job/job-ui.tsx:22 `ReceiptRow`, people/members-screen.tsx:198 `Line`, time/time-off-section.tsx:429 `Line`, calendar/event-sheet.tsx:152 `Row`, clock-out-sheet.tsx:577 `Row` | `amazen/fact-row.tsx` `<FactRow label value tone first? onPress? strong? labelWidth? />` |
| 2.3 | **Row in a well** (first/last rounding, hairline top border) | register/well-row.tsx:12 `WellRow` (used by 4 screens), clients/client-row.tsx:58, documents/document-row.tsx:84, settings/settings-ui.tsx:67 `SwitchRow`, customer/contact-row.tsx:50, customer/address-row.tsx:37, chat/chat-rows.tsx:46,94; 21 call sites pass `first={index===0}` (clients-screen, sync-page, notifications-page, reminder-list, chat-group-views, chat-screen, register-*, requests-screen, team-screen, team-messages, approvals-screen, equipment-screen, record-about) | Move `WellRow` to `amazen/well-row.tsx` with `leading/title/detail/trailing` slots plus a `WellRowFrame` for custom bodies; `SwitchRow`, `ClientRow` and `DocumentRow` become thin wrappers |
| 2.4 | **List states** (centered "Loading…" caption, empty well, error) | Loading caption ×11: chat-group-views.tsx:49, rota/schedules-screen.tsx:158, people/person-screen.tsx:51, team-screen.tsx:159, members-screen.tsx:129, invitations-screen.tsx:157, team-messages.tsx:138 & 185, equipment-picker.tsx:56, equipment-screen.tsx:236, manage/time-off-requests.tsx:85. Empty icon+text: team-messages.tsx:186-191, route-planner.tsx:528-533, manage/attendance.tsx:505, overtime/[id].tsx:115. "Not allowed" lock: asset-log.tsx:267, asset-expense.tsx:375, scan-card.tsx:117. The existing `screen-states.tsx` (`LoadingState`/`ErrorState`) is used by only 2 files | `amazen/list-state.tsx`: `<ListState loading empty={{icon,title,body}} error onRetry />`, plus `<EmptyState>` and `<NotAllowed>`; retire `screen-states.tsx` |
| 2.5 | **Monogram / avatar circle** | job/job-ui.tsx:378 `Initials`, people/person-avatar.tsx:39, customer/client-avatar.tsx:42, clients/client-row.tsx:62, customer/record/record-hero.tsx:72, customer/contact-row.tsx:60, home/reminder-row.tsx:98, home/crew-card.tsx:486 `ringInitials` + `RingButton`, (tabs)/_layout.tsx:55 `ProfileButton`, onboarding/pass-badge.tsx:21 | `amazen/monogram.tsx` `<Monogram name|person size tone photo? presence? />`; `PersonAvatar` and `ClientAvatar` wrap it |
| 2.6 | **Tone → colour ternary** (`tone==='critical'?c.critical:tone==='warn'?c.warn…`) | 18 copies in 11 files: settings-ui, home/action-strip, home/strip-box, chat/chat-rows, requests/precheck-card, job/job-ui, job/job-facts, documents-screen, issues/my-issues-sheet, equipment-screen, issues/issue-thread-sheet | `toneColor(c, tone)` in `theme/amazen.ts` |
| 2.7 | **Pill / chip buttons** with inline `radius.full` | worklog-sheet.tsx:177, time/time-history.tsx:159, time/time-off-section.tsx:241, rota/schedules-screen.tsx:137 & 339, people/invitations-screen.tsx:146, job/job-fields.tsx:118, job/sheets/step-form-sheet.tsx:267, job/job-checklist.tsx:244, jobs-list/jobs-controls.tsx:66, onboarding/pass-frame.tsx:59, (auth)/register.tsx:116. Four components already compete: `FilterChip` (legacy, 6 files), `FilterPill` (19), `ChoicePill` (6), `Chip` (7) | Keep `ChoicePill` (on/off) and `Chip` (action); retire `components/filter-chip.tsx`; replace the inline copies |
| 2.8 | **Sheets** — five systems | `JobSheet` (job/job-ui.tsx:41, imported by 45 files, many outside job/), `BlurSheet`+`SheetPanel` (24 files), `SlideSheet` (5), `ConfirmSheet` vs `JobConfirmSheet`, and **raw `<Modal>`**, which skips the one-slot queue in `blur-sheet.tsx`, in issue-thread-sheet, jobs-list/jobs-screen, location-picker-sheet, new-job/when-sheets, date-picker-modal, time-picker-modal, LocationConsentModal, (customer)/(tabs)/profile | One `amazen`-adjacent `AppSheet` (= `JobSheet` renamed and moved to `components/sheet/`), one `ConfirmSheet`; extend `sheet-surface.spec.ts` to fail on a raw `<Modal>` outside blur-sheet/slide-sheet |
| 2.9 | **Message thread UI** (bubble + composer) ×3 | chat/chat-rows.tsx:158 `MessageRow` + chat-composer.tsx:97; app/(app)/support.tsx:387 `SupportBubble` + TextInputs 308-343; issues/issue-thread-sheet.tsx:565 `Bubble` + TextInputs 333 & 458 | `components/thread/bubble.tsx` + `thread-composer.tsx` (text + photos + send); support and shift-issue threads reuse the chat pieces |
| 2.10 | **Upload picked photos** (downscale → presign → PUT → collect, skip on failure) | chat/chat-photos.ts:18-31, issues/photos.ts:18-31, asset-expense.tsx:233 & 325, asset-log.tsx, supply-document/use-credential-photo.ts, worklog/use-worklog.ts, new-job/use-create-job.ts, send-document.tsx | `lib/upload-photos.ts` `uploadPickedPhotos(photos, presign, {maxEdge})` |
| 2.11 | **Data loading in screens** | 79 component/screen files call `*Api.` directly (top: support.tsx 9, equipment-screen 7, register-record 6, chat-group-views 6, calendar/event-sheet 6, issue-thread-sheet 5, new-event-screen 5, sign-document 5, asset-expense 5). `useFetchData` exists but has 2 users, while 21 files hand-roll `refreshing` state. Paginated feeds are hand-written 3× (manage/attendance.tsx:140-217, clients-screen, register-screen) | Rule: screens call hooks, not api modules. Use `useFetchData` (or `useQuery` — 8 files already use TanStack) for reads, a new `usePagedFeed` for paging, and a `use-*-actions.ts` per area for writes |
| 2.12 | **Presence** colour + words | Colours: (tabs)/_layout.tsx:47, profile/profile-screen.tsx:282, people/person-avatar.tsx:12 `PRESENCE_DOT`, web chat-format.ts:5. Words: chat/chat-format.ts:44 `presenceText`, people/team-screen.tsx:279 (a copy), web chat-format.ts:9 `presenceLabel` | `packages/shared/src/people/presence.ts`: `PRESENCE_KEYS`, `presenceKey`, `presenceTone`, `presenceLabelKey` (an i18n KEY, not words); mobile and web keep only the colour token map |
| 2.13 | **"Read vs guess" form field** (FOUND/CHECK) | asset-expense.tsx:523 `Field`, supply-document/credential-section.tsx, asset-log.tsx:355 `FieldInput` (choice/photo/text) | `components/forms/read-field.tsx` + `kind-field-input.tsx` |
| 2.14 | **Socket subscribe boilerplate** | see §1.13 | `useSocketEvents` + `useOnSocketReconnect` |
| 2.15 | **Two style systems** | 47 files import `COLORS/SPACING/FONT_SIZE` from `lib/constants`; 66 read the legacy `useTheme().colors`; 196 use amazen. All of route-planner, manage/attendance, asset-expense, asset-log, sign-document, scan-card, (customer)/*, always-location-sheet and media-access-screen are legacy | Migrate per screen as each one is touched; a guard spec freezes the legacy count so it only goes down |
| 2.16 | **`job/job-ui.tsx` is the de-facto UI kit** | It is imported by 65 files outside `job/`: `SectionLabel` 40, `JobSheet` 25, `QuietButton` 13, `Pill` 13, `SheetOption` 12, `Banner` 11, `JobField` 9 | Move `Banner`, `SectionLabel`, `QuietButton`, `Pill`, `Dot`, `JobField`, `SheetOption` into `amazen/`, leaving re-exports in job-ui for one release |

---

## 3. Logic duplicated with the web app that belongs in `packages/shared`

1. **Intl locale from the app language** (`de→de-DE …`), in four copies: mobile `chat/chat-format.ts:6` `localeOf`,
   mobile `hooks/useTimeFormat.ts:29`, web `hooks/use-time-format.ts:~38`, web `lib/invoice-document-locale.ts:166`.
   Replace with shared `intlLocaleOf(lang)`.
2. **Chat time wording**: `timeHM`, `dayLabel`, `whenShort` (mobile chat-format.ts:15-42) and `timeHM`, `relTime`,
   `dayLabel` (web chat-format.ts:16-40) are the same rules. Move them to `packages/shared/src/chat/format.ts`, returning
   keys and values; the apps only call `t`.
3. **Read-receipt wording**: mobile chat-screen.tsx:118-123 and web message-bubble.tsx:103 both turn `readState` into
   Sent / Read / Seen by everyone / Seen by N. Add `receiptOf(conv, msg) → { read, key, count }` beside `readState` in shared.
4. **Presence**: §2.12.
5. **Conversation search filter** (team-messages.tsx:131, title + last body contains q). The web Messages list probably has
   the same filter (not verified); a shared `matchesConversation(cv, q, lang)` would cover both.
6. Job-page text (facts, timer line, closed text): keep it on mobile in `job-page-model.ts`. The web job page renders a
   different layout, so only the *rules* (already in shared `tasks/*`) should be common.

---

## 4. Long lines — causes and a rule

Of the ~1,571 non-test lines over 140 characters:

| Cause | Lines |
|---|---|
| Inline style objects (`style={{…}}`, `({pressed}) => ({…})`) | **606** |
| `t('key', 'English default…')` with long defaults or interpolation | 284 |
| One-line handlers and logic (`onPress={() => { …; …; }}`, chained ternaries) | 279 |
| Other: StyleSheet entries written on one line, JSX with 6+ props per line, SVG paths | 354 |
| Decorative comment rules (`// ── … ───`) and imports | 48 |

There are 1,955 `style={{` literals, against 82 `StyleSheet.create` files and only 9 style factories
(customer/* and media-access-screen). The repo has no Prettier config, and `apps/mobile/eslint.config.mjs` has no max-len.

Rule to adopt:
1. **Prettier for apps/mobile, `printWidth: 120`**, run on touched files only, so a whole-repo reformat does not destroy
   blame. Add ESLint `max-len: [warn, 140, { ignoreStrings: true, ignoreTemplateLiterals: true, ignoreUrls: true, ignoreComments: false }]`.
2. **Styles come from a themed factory, not literals**:
   `const useStyles = makeStyles((a: Amazen) => ({ row: {…}, label: {…} }))` in `theme/make-styles.ts`, memoised per theme.
   - At most **one** dynamic key may be added inline (`[s.row, { opacity }]`).
   - No inline object with more than 3 keys.
   - Repeated shapes such as hairline rows, round FABs and pills become primitives (§2).
3. **Handlers longer than one statement get a name** (`const onSend = useCallback(…)`), never an inline block.
4. **i18n defaults**: when the key exists in `en.json`, use `t('key')`; the catalogue specs already check that keys exist.
   Long interpolated defaults (clock-out-sheet.tsx:178 and 230) belong in the catalogue only.
5. **JSX**: more than 3 props means one prop per line (Prettier does this).
6. A guard spec, in the style of the existing `__tests__/*-guard.spec.ts`, freezes today's per-file long-line count so it
   can only go down.

---

## 5. Prioritised refactors (all OTA-safe; none needs a native build)

| # | Refactor | Size | Risk | Notes |
|---|---|---|---|---|
| 1 | **Chat data hooks**: `useConversations`, `useChatContacts`, `useMessageSearch`, `useGroupActions`, `useSocketEvents`, `useOnSocketReconnect`; slim chat-screen and team-messages | M (~400 lines moved, −150 net) | Low-Med | Removes 3× list fetch, 2× contacts fetch, 2× reconnect ref. Chat motion was approved 2026-10-16, so keep `Arrive` usage unchanged. 2 source specs |
| 2 | **Shared presence, chat time and receipt wording, `intlLocaleOf`** in packages/shared, used by mobile and web | S | Low | Pure functions with unit tests. Needs both apps rebuilt (web deploy + OTA) |
| 3 | **amazen primitives**: `CountBadge`, `FactRow`, `WellRow` (moved), `ListState`/`EmptyState`/`NotAllowed`, `Monogram`, `toneColor` | M | Low | About 50 call sites; do it screen by screen. No gestures, so it is barrel-safe |
| 4 | **Move job-ui primitives into amazen** (Banner, SectionLabel, QuietButton, Pill, JobField, SheetOption), with re-exports | S | Low | 65 importers; the re-export keeps it non-breaking |
| 5 | **job-page split** (`job-page-model.ts` pure, `use-job-actions`, `use-seen-sections`, `use-sheet-slide`, `job-sheets.tsx`) | L | **Med-High** | 12 source specs read job-page.tsx. Repoint them, ideally at the folder. The money path is clock gate → step move, so test on a device |
| 6 | **route-planner onto use-route-day pieces** (`useNavApps`, `useRestoredPlan`) plus the component split; delete dead `navApp` and `navChip` | M | Med | The route planner OTA was held earlier because nav-app detection is native config. I did not check whether the current binary carries `LSApplicationQueriesSchemes`/`<queries>`; confirm that before shipping any behaviour change. A pure refactor is safe |
| 7 | **One sheet system**: rename and move `JobSheet` → `components/sheet/app-sheet.tsx`; replace raw `<Modal>` in 8 places; merge ConfirmSheet and JobConfirmSheet; extend `sheet-surface.spec.ts` | M | Med | Raw Modals are a known UIKit "second popup refused" trap. Test iOS stacked sheets on a device |
| 8 | **Thread UI shared** by chat, support and shift issues (`thread/bubble`, `thread/composer`) plus `uploadPickedPhotos` | M | Med | Support and issue threads change look slightly, so get the user's mockup OK first (UI rule: artifact mockup before code) |
| 9 | **Data-loading rule**: `usePagedFeed` (attendance, clients, register), push the remaining direct `*Api` calls into `use-*` hooks starting with support.tsx, equipment-screen, register-record, event-sheet, sign-document, asset-expense | L (incremental) | Low-Med | Add a guard spec freezing the count of `app/**` and `components/**/*.tsx` files that call `*Api.` |
| 10 | **Long-line and style rule**: Prettier (120) + max-len warn + `makeStyles` factory; migrate legacy-`COLORS` screens (route-planner, manage/attendance, asset-*, sign-document, scan-card) to amazen when touched; split `api/client.ts`, `sync-engine.flush`, crew-card, my-work-card, clock-out-sheet and use-client-record as they are next edited | L (ongoing) | Low per file | Format only touched files. client.ts keeps a re-export barrel (7 specs). sync-engine is the offline core (see the memory note on the dead-database incident), so run the offline e2e and diagnostic after touching it |

Order: 2 → 3/4 (primitives first, so the splits have something to use) → 1 → 5 → 6 → 7 → 8, with 9 and 10 continuous.
Ship as one batched OTA after a dev-server preview, per the deploy-batch and preview-first rules.
