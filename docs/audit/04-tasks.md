# Area 04 — Tasks & Task Types

Routes: `/tasks`, `/tasks/[id]`, `/task-types`, `/tasks/recurring`, `/sprints`.
The largest surface in the product — `/tasks` alone is 1,615 lines over ~6,150 lines of
view components, and the gateway controller carries 30 endpoints.

Status: **All six passes run. All 3 findings fixed.** 1 High, 2 Medium.

---

## A. What this feature is (from the code)

**In one paragraph:** a Task belongs to a space and follows that space's task type (a
`StatusWorkflow`), and almost every other feature attaches to it — assignees (a lead plus
multi-assignee rows), comments, a timeline, checklists, subtasks, dependencies, custom
fields, attachments on S3, service reports, GPS route tracking, sprints/epics/phases. The
list page renders one of six views (board, table, grouped, timeline, calendar, epic roadmap)
over the same query. Authorization is deliberately **per-task rather than per-route**: a
field employee must be able to advance a task assigned to them without holding any org-wide
permission, so most mutation endpoints carry no `@RequirePermission` and the service decides
from the caller's relationship to that specific task.

### Server surface — 30 endpoints

| Guard | Endpoints |
|---|---|
| `@RequirePermissionInSpace` | create, update, assign |
| `@RequirePermission` | suggested-employees, assignees, subtasks, dependencies |
| `@Roles(ADMIN)` | delete, resync |
| **none — service authorizes per task** | status, decline, comments, timeline, checklist, attachments |
| `@RequireModule` | dependencies, custom fields *(after this audit)* |

---

## Findings

| ID | Sev | Pass | Title | Status |
|----|-----|------|-------|--------|
| T-B1 | **H** | B | Two paid features returned 402 to **every** organization since 2026-08-21 | **fixed** |
| T-D1 | M | D | Dependency and attachment-removal mutations announced nothing | **fixed** |
| T-C1 | M | C | Six views and every dialog loaded eagerly on the heaviest page in the product | **fixed** |

### T-B1 — a gate pointed at a key that does not exist **(High)**

`PlanGuard` **fails closed**: a key that is not a real add-on throws 402 rather than granting
the feature. That is the right default, and its own doc comment says so — a typo must not
hand a paid capability to every customer.

The cost of that default is that a **wrong** key silently disables a working feature, and
the 402 it returns is indistinguishable from a legitimate "you haven't bought this".

When the 2026-08-21 migration replaced tiers with add-ons, two decorators were left behind:

| Decorator | Where | Effect |
|---|---|---|
| `@RequirePlan('dependencies')` | `tasks.controller.ts:509, 526` | add/remove task dependency → **402** |
| `@RequirePlan('custom_fields')` | `custom-fields.controller.ts:26, 79` | every custom-field **write** → **402** |

Neither key is in `AVAILABLE_ADD_ONS`. Both are **per-space modules**
(`AVAILABLE_MODULES`, group `task`) — and both still appear in the vestigial `plans.ts`,
which is where the decorators came from. So `isAddOn(...)` returns false, the guard falls
through to `throw`, and `addOnDef(...)` finds nothing, producing the *generic* message:
`"This feature is not available on your subscription"`.

Since that deploy, task dependencies and custom-field writes have been refused for **every
organization**, including ones on the 14-day trial that is supposed to grant everything.
Reads were unaffected — both guards short-circuit on GET — so the features looked present
and failed only on save.

**Fixed** by moving both to `@RequireModule`, which is the guard that owns per-space
modules, and which passes through cleanly for keys it doesn't recognise because
`@RequirePlan` owns those.

**Fixed durably** by a test that reads the decorators out of the source and asserts every
`@RequirePlan` key is a real add-on and every `@RequireModule` key is a real module. The
next mismatch fails in CI instead of in production.

> The scanner initially reported `@RequirePlan('reccuring')` — from PlanGuard's *own doc
> comment*, which uses that misspelling as the illustrative example. It now strips comments
> first: a scanner that counts prose as code reports the documentation as the bug.

### T-D1 — two mutations that changed a task without saying so

Task events are otherwise thorough — created, updated (7 call sites), assigned, status
changed, comment added, declined, deleted, and checklist/subtask mutations all announce.
Two did not:

- **Dependencies.** `addDependency` / `removeDependency` emitted nothing, so a second
  viewer's task detail kept the old chain. Nobody had reported it because the route was
  402ing for everyone (T-B1) — fixing that is what makes this reachable. Both ends of the
  link are announced now, since a dependency changes *two* tasks.
- **Attachment removal.** Adding announced `attachment_added`; removing announced nothing,
  so another viewer's gallery kept showing a file that no longer exists and clicking it 404s
  against S3.

### T-C1 — the heaviest page loaded all six views to show one

`/tasks/page.tsx` had **zero** `dynamic()` imports and 12 static component imports. Only one
view renders at a time, and the dialogs render on a click. Now lazy: timeline (702),
calendar (476), epic roadmap, grouped list, create-task dialog (**1,402**) and the four
sprint/epic dialogs (566). The default board and `TaskTableRow` stay static so the primary
path has no loading flash.

> `GroupedList` exports a **type** next to the component, and `BacklogToolbar` exports sort
> helpers used in render logic — those stay static imports. A `dynamic()` boundary carries
> values, not types.

---

## Verified good (checked, no finding)

- **Per-task authorization is real, not assumed.** The ungated mutation routes hand the
  service the caller's id, role, permission flags and resolved access; `updateStatus`
  (`tasks.service.ts:1306+`) then distinguishes the assignment lead, multi-assignee rows,
  org-wide manage authority and cancellation rights, with distinct refusals for each — a
  worker may execute a task assigned to them and may **not** cancel it.
- **The attachment flow is properly closed.** Presign checks task access, allow-lists the
  MIME type, caps the size, sanitises the filename, and builds the S3 key **server-side**
  (`attachments/{taskId}/{ts}-{safeName}`) — the client never supplies it. The confirm step
  then re-checks that the submitted URL starts with the presigned prefix for *that task*,
  with a comment naming the attack it prevents (stored XSS / phishing in the gallery).
- **Dependency integrity**: both tasks are org-checked, duplicates rejected, and cycles
  detected by walking the predecessor chain with a depth cap.
- **Attachment delete** is uploader-or-ADMIN, org-checked, deletes from S3 with a graceful
  failure path, and writes a `TaskEvent`.
- **i18n**: 389 distinct keys across 42 files, **0 missing** in de/es/fr/it.

## Open questions

- Task sub-features that ARE modules — `checklists`, `subtasks`, `attachments`,
  `time_tracking` — carry no `@RequireModule` on their routes, so switching a module off in a
  space hides the UI but still accepts writes through the API. Whether that is intended
  (the module is a display preference) or a gap (it is an entitlement) is a product call, and
  the answer decides whether four more decorators are missing. **Not** filed as a finding
  without that answer.
- S3 keys here are `attachments/{taskId}/…` while the worklog uses `{orgId}/attendance/…`.
  Task ids are cuids so nothing collides, but the inconsistency rules out per-tenant bucket
  policies and lifecycle rules.

## Verdict

**PASS WITH FIXES** — the High had been live in production for three days short of a month,
returning a message that read like a billing state rather than a defect.
