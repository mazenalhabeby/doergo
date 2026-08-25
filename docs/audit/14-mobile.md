# Area 14 — Mobile app (React Native / Expo)

`apps/mobile` — 54 route files, ~18,500 lines. The primary client for field staff.

Status: **All six passes run. 2 findings fixed, 1 raised for a product decision.**
0 Critical, 0 High.

---

## Why mobile is audited differently

It ships a **binary to a device you do not control**. Anything in the bundle is readable by
whoever holds the phone, an update needs an OTA push or a store review rather than a deploy,
and the app holds long-lived credentials and background permissions that a browser tab never
gets.

---

## Findings

| ID | Sev | Pass | Title | Status |
|----|-----|------|-------|--------|
| MB-F1 | M | F | 32 strings rendered in English to German, Spanish, French and Italian users | **fixed** |
| MB-F2 | L | F | One key existed in no locale and no default — it rendered as the raw key | **fixed** |
| MB-B1 | — | B | A worker's position is recorded with no job context | **raised, not changed** |

### MB-F1 / MB-F2 — the five-language claim did not hold on mobile

The web app is complete in all five locales; mobile was not. The pattern
`t('key', 'English fallback')` means a missing translation renders **English**, silently and
without failing — so 32 strings across route planning, the work log, customers, issues and
billing showed English to every non-English user. Route planning is a field-worker screen, so
the people most affected were the ones least likely to have English as a working language.

One key was worse: `attendance.unknownLocation` existed in **no** locale and had **no**
default, so it rendered the literal string `attendance.unknownLocation` inside a banner.

Both fixed — 32 keys translated into de/es/fr/it against the app's established vocabulary
(*Aufgabe / tarea / tâche / attività*, formal "Sie" in German), and all five locales are now
complete. Verified with a scanner that also handles `i18n.t(…, { defaultValue })`, which the
first pass missed.

### MB-B1 — location recorded outside a job **(raised, deliberately not changed)**

`location.service.updateLocationBatch` upserts `workerLastLocation` **before** it checks
anything about a task:

```ts
const location = await this.prisma.workerLastLocation.upsert({ … });   // unconditional
if (taskId) { /* only here: EN_ROUTE + isTaskAssignee before writing history */ }
```

Route **history** is properly gated — it needs an EN_ROUTE task and the caller must be its
lead or a co-assignee. But the *last known position*, which is what a dispatcher sees on the
live map, is written on any authenticated call, with no requirement that the member is on a
job or even clocked in.

I have **not** changed this, because it is a product decision rather than a defect: "show me
where my people are right now" may be exactly the intended feature, and gating it would
change what dispatchers see. It is raised because for an Austrian employer the question
"under what circumstances is an employee's location recorded?" has a legal answer, and right
now the code's answer is "whenever the app posts". Worth a deliberate decision either way.

---

## Verified good (checked, no finding)

This app is in better shape than its size suggests. Each of these was a specific thing I
went looking for:

- **No secrets in the shipped bundle.** Extracting strings from the built Hermes bundle
  (`dist/…/entry-*.hbc`, 4.3 MB) turns up the API URL and **no** `AIza…` Google key — the
  maps key reaches the native layer through `app.config.ts`, not the JS bundle.
- **The OTA URL pitfall did not bite this build.** `eas update` inlines
  `EXPO_PUBLIC_API_URL` from the local `.env`, which has previously shipped a bundle pointing
  at `localhost`. This one contains `https://hbcfield.com/api/v1`.
- **`play-store-key.json` has never been committed** — zero commits touch it.
  `google-services.json` was committed historically, but it is designed to ship inside the
  app and its key is package-and-signature restricted.
- **Credentials are in `expo-secure-store`**, encrypted: access token, refresh token, user.
  `AsyncStorage` holds only the offline work-log queue — notes, not credentials.
- **Logout is thorough, and in the right order.** It stops route tracking, the background
  heartbeat and the geofence watcher *first* so the OS foreground service and GPS
  subscription are torn down immediately, then **purges the push-token registration while the
  session token is still valid** — so a shared device stops receiving the previous user's
  notifications. Only then does it clear tokens and user.
- **The headless location task stops itself when there is no token**, so a logged-out device
  cannot keep reporting.
- **No cleartext-traffic exemptions** — no `NSAllowsArbitraryLoads`, no
  `usesCleartextTraffic` in `app.config.ts`.
- **The batch upload is server-authorized**: route history requires EN_ROUTE *and*
  `isTaskAssignee`, which correctly includes co-assignees — a comment records that matching
  `assignedToId` alone used to discard every point a co-assignee recorded.

## Open questions

- **Offline queue durability.** The work log queues in `AsyncStorage` and batch-flushes. I
  did not test the failure modes that matter — app killed mid-flush, duplicate submission,
  queue growth with no network for a long shift. A duplicated *clock-in* is guarded
  server-side ("you are already clocked in"), which is the expensive case; the work log is
  not obviously idempotent.
- **The Google Maps key restriction.** The key is not in the JS bundle but it is in the APK's
  native config, which is extractable. Whether it is restricted by package name + signing
  certificate is a Google Cloud console question, not a repository one. Memory records
  "restrict key after verify" as an open item from the earlier maps fix.

## Verdict

**PASS WITH FIXES** — no security findings. The gap was that the product's five-language
promise was true on web and quietly false on mobile.
