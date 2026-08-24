# Area 01 — Members & Access

Status: **All six passes run. All 11 findings fixed.** Awaiting re-verification in two browser sessions (exit gate #2).

---

## A. What this feature is (from the code)

**In one paragraph:** `/members` is the org's people directory and the only place org-level access is
granted. An admin (anyone with `canManageUsers`) sees every member of their organization in one
paginated table with their role, the spaces they are assigned to, and their status; they can search
and filter by role, edit one member's role and granular access profile, assign members to spaces,
remove them, and do all of that in bulk over a checkbox selection. The same screen also lists
**pending invitations** that have not been accepted yet, so "people in the org" and "people invited
to the org" are one mental object. `/members/[id]` is the single-member record; `/members/invite`
issues an invitation with the access profile pre-chosen.

### Routes

| Route | Type | Lines | Notes |
|---|---|---|---|
| `/members` | `"use client"` | 990 | Table, filters, bulk bar, 3 dialogs, invitations panel |
| `/members/[id]` | `"use client"` | 741 | Single member record |
| `/members/invite` | `"use client"` | 321 | Invite + access profile |
| `_components/edit-member-dialog.tsx` | client | — | Role + permission editor |

### Reads

| Query key | Endpoint | staleTime | Paged | Notes |
|---|---|---|---|---|
| `["orgMembers", search, role, page]` | `GET /organizations/members` | *global 60s* | ✅ 20/page | debounced search |
| `["locations-all"]` | `GET /locations?limit=100` | 60s | cap 100 | reference data |
| `["all-location-assignments", ids]` | `POST/GET rosters(ids)` | 60s | — | **batched** — was an N+1 fan-out, already fixed (P2) |
| `["pendingInvitations"]` | `GET /invitations?status=PENDING&limit=50` | *global 60s* | cap 50 | admin only (`enabled: isAdmin`) |

### Writes

| Action | Endpoint | Invalidates | Optimistic |
|---|---|---|---|
| Remove member | `DELETE /organizations/members/:id` | `["orgMembers"]` | ❌ |
| Revoke invite | `DELETE /invitations/:id` | `["pendingInvitations"]` | ❌ |
| Edit role / access | `PATCH /organizations/members/:id` | `["orgMembers"]` | ❌ |
| Bulk role change | N× `PATCH …/members/:id` | `["orgMembers"]` | ❌ |
| Bulk space assign | N× `POST /locations/:id/members` | `["all-location-assignments"]` | ❌ |
| Bulk remove | N× `DELETE …/members/:id` | `["orgMembers"]` | ❌ |

Bulk actions use `Promise.allSettled` and report `ok`/`failed` separately — a partial failure is
surfaced, not swallowed (already fixed, D4).

### Server surface — `organizations.controller.ts`

Every member endpoint is behind `@RequirePermission('canManageUsers')`; the org-profile and
settings endpoints are `@Roles(Role.ADMIN)`.

| Method | Endpoint | Guard |
|---|---|---|
| GET | `/organizations/members` | `canManageUsers` |
| GET | `/organizations/members/:id` | `canManageUsers` |
| PATCH | `/organizations/members/:id` | `canManageUsers` → emits `member_access_updated` |
| DELETE | `/organizations/members/:id` | `canManageUsers` |
| POST | `/organizations/members/:id/reset-password` | `canManageUsers` |
| GET | `/organizations/members/:id/watchers` | `canManageUsers` |
| GET/POST/PATCH/DELETE | `/organizations/roles*` | `canManageUsers` |
| GET | `/organizations/contacts` | *(no `@Roles` / no `@RequirePermission`)* — **verify in Pass B** |

---

## Findings

| ID | Sev | Pass | Title | Status |
|----|-----|------|-------|--------|
| M-B1 | **H** | B | Self-escalation via `enabledModules` — a member can widen their own space visibility | **fixed** |
| M-B2 | **H** | B | A non-admin with `canManageUsers` can remove ADMINs — no ceiling guard on delete | **fixed** |
| M-D1 | M | D | `member.access_updated` is a dead event — emitted, nobody listens | **fixed** |
| M-D2 | M | D | No member events in `EVENT_INVALIDATIONS` at all | **fixed** |
| M-D3 | M | D | Approving a join request does not refresh the members list | **fixed** |
| M-E1 | M | E | `ROLE_CONFIG` defined 3× with different shapes; one fallback points at a retired role | **fixed** |
| M-F1 | M | F | No error state — a failed fetch renders "No members yet" | **fixed** |
| M-C1 | M | C | ~1,455 lines of dialogs eagerly loaded into the list route bundle | **fixed** |
| M-C2 | L | C | `listOrgContacts` `findMany` has no `take` | **fixed** |
| M-F2 | L | F | `#6b7280` hex literal instead of a token (×2) | **fixed** |
| M-D4 | L | D | No optimistic feedback on any member mutation | **fixed** |

---

### M-B1 — Self-escalation via `enabledModules` **(High)**

`users.service.ts:1082-1094` builds `touchesPrivilege` from `role`, `canManageUsers`,
`canCreateTasks`, `canViewAllTasks`, `canAssignTasks`, `taskCreationScope`, `canViewReports`,
`memberRoleId` — and **not** `enabledModules`. `assertCanGrantRoleAndPerms` is likewise only invoked
when `dto.role` or `dto.canManageUsers` is present (`:1097`).

But `enabledModules` **is** the per-user Access Profile
(`packages/shared/src/types/modules.ts:28-34`), and its `spaceScope` is a server-enforced read
control: `task-service/src/modules/locations/locations.service.ts:643` — `if (data.spaceScope ===
'all')` returns every space in the org, taken from the caller's own profile via
`gateway/.../locations.controller.ts:121  spaceScope: getSpaceScope(req.user)`.

**Repro** — as a member holding `canManageUsers` but **not** `role: ADMIN`:

```
PATCH /api/v1/organizations/members/<OWN_USER_ID>
{ "enabledModules": { "spaceScope": "all", "platforms": "both", "webScreens": [...], "modules": [...] } }
```

→ 200. The self-mutation guard does not fire; the ceiling guard is never called. The gateway then
purges their auth cache (`organizations.controller.ts:272`) so the widened scope takes effect on the
**next request**. Expected: 400, same as `memberRoleId`.

**Fix**: add `enabledModules` to `touchesPrivilege`, and run `assertCanGrantRoleAndPerms` whenever
`enabledModules` is present so a non-admin also cannot re-scope an admin.

### M-B2 — A non-admin can remove admins **(High)**

`removeMember` (`users.service.ts:944-1055`) checks exactly two things: not-self, and not-the-last-
admin. It never calls `assertCanGrantRoleAndPerms`. The gateway route carries only
`@RequirePermission('canManageUsers')` (`organizations.controller.ts:343`).

`updateMemberProfile` deliberately blocks this — `assertCanGrantRoleAndPerms` throws when
`targetIsAdmin`, with the comment *"A non-admin holding canManageUsers … cannot mint admins or touch
an existing admin."* Delete is the same act with a stronger effect and does not enforce it.

**Repro**: a member with `canManageUsers` and `role != ADMIN` calls
`DELETE /api/v1/organizations/members/<an ADMIN's id>` → 200 while ≥1 other admin remains. Repeat
until one admin is left. Expected: 403.

**Fix**: call `assertCanGrantRoleAndPerms(requesterId, organizationId, member, {})` in `removeMember`
before the history probe — one line, reuses the existing guard.

### M-D1 / M-D2 / M-D3 / M-D4 — live sync

`organizations.controller.ts:277` emits `member_access_updated`; `notification.controller.ts:97`
delivers it as `member.access_updated` via `emitToUser(memberId, …)`. Grepping `apps/web-app` **and**
`apps/mobile` for `access_updated` returns **nothing** — the event is delivered to a client that has
no listener. A member whose access you change keeps their old navigation until they reload (M-D1).

`hooks/use-realtime-sync.ts` `EVENT_INVALIDATIONS` covers tasks, attendance, excursions, spaces and
tracking — no member events exist at all, so Admin B's removal / role change / revoked invite is
invisible on Admin A's open `/members` tab (M-D2).

`join-requests/page.tsx:142,156` invalidates only `["join-requests"]`, so an approved member is
missing from `/members` for up to the global `staleTime` (M-D3).

No member mutation is optimistic — every row waits a full round-trip (M-D4).

### M-E1 — `ROLE_CONFIG` defined three times, already drifted

| Where | Shape | Fallback |
|---|---|---|
| `members/page.tsx:86` | `{ className, gradient }` | `EMPLOYEE` |
| `members/[id]/page.tsx:65` | `{ labelKey, className, gradient }` | **`TECHNICIAN`** |
| `components/nav-user.tsx:37` | `{ bg, text, border }` | `ADMIN` |

Three shapes, three fallbacks, three colour sets for one concept. The detail page falls back to
`TECHNICIAN` — a role **retired** by the unified role system — so an unrecognised role renders with
no styling there and with `EMPLOYEE` styling one click away. This is the drift DRY exists to prevent,
and it has already happened.

**Fix**: one `roleBadge()` in `packages/shared` (or `lib/`), returning tokens; all three call it.

### M-F1 — a failed fetch looks like an empty organization

`members/page.tsx:479` destructures only `{ data, isLoading }` — `isError` is never read. The render
is `isLoading ? shimmer : members.length ? table : empty-state` (`:720`, `:815`). When the request
fails, `members` is `[]`, so an admin of a 50-person org is shown **"No members yet"** with an
*"Invite your first member"* button (`:820`).

### M-C1 — dialogs in the list bundle

`members/page.tsx:32-35` eagerly imports `CreateInvitationDialog` (372 lines), `ManageRolesDialog`
(230), `EditMemberDialog` (601) and `AccessBuilder` (252) — ~1,455 lines shipped on first paint for a
page whose job is a table. The sibling `[id]/page.tsx:43` already does this right
(`dynamic(() => …PerformanceTab)`).

### M-C2 — unbounded contacts query

`users.service.ts:749-771` — `findMany` with no `take`. Bounded in practice by admins+managers per
org, but it is an uncapped list endpoint.

### M-F2 — hex literals

`members/page.tsx:259` and `[id]/page.tsx:369` — `"#6b7280"` as the fallback for a user-chosen role
colour. Should be a token.

---

## Verified good (checked, no finding)

- **Tenancy**: every members read and write takes `organizationId` from `user.organizationId` (the
  token) — never from the body or query. Confirmed at controller *and* service
  (`findFirst({ id, organizationId })` on every by-id path).
- **Field exposure**: `ORG_MEMBER_SELECT` (`users.service.ts:28-59`) is an explicit allow-list — no
  `passwordHash`, no tokens.
- **Pagination**: clamped server-side to `min(200, …)` (`:790`) — a client cannot request an
  unbounded page. Search is debounced client-side.
- **N+1**: the space-roster fan-out was already replaced by one batched `getRosters(ids)` call
  keyed on sorted ids.
- **Escalation guards that do work**: self-role change blocked; `memberRoleId` ceiling-checked
  against the requester's own permission set; non-admin cannot mint or touch admins **on update**;
  last-admin protected on both demote and remove.
- **`GET /organizations/contacts`** — the missing `@RequirePermission` is correct. The service is
  secure-by-default (`contactScope === 'NONE'` → `[]`), org-scoped, restricted to admins/managers,
  and returns a narrow select with **no email and no permission flags**.
- **Session handling**: `validateToken` rejects `!isActive` (`auth.service.ts:454`); update and
  remove both purge the gateway auth cache and remove force-disconnects the member's sockets;
  password reset revokes all refresh tokens in the same transaction.
- **Removal integrity**: hard-delete only when a 14-table history probe is clean, else soft-delete
  that detaches rosters/schedules and unassigns only non-terminal tasks.
- **i18n**: 178 `members.*` keys, **0 missing and 0 extra** in de/es/fr/it. The handful of values
  identical to English are cognates (`Position`, `Manager`, `Status`, `Mobile`, `Flexible`) — worth a
  native-speaker glance, not a defect.
- **States**: proper shimmer skeleton and a designed empty state (the gap is the *error* state, M-F1).

## Open questions

- `/members/[id]` fires 5 queries on mount before any tab is opened. Tab-gated queries and
  `staleTime`s are already in place — is the mount fan-out worth collapsing into one endpoint?
  Needs measurement, not assertion.
- `POST /organizations/members/:id/reset-password` returns the temporary password in the response
  body. Intended (the admin reads it out), but confirm it is never logged and is rate-limited.

## Fixes applied

| ID | What changed |
|----|--------------|
| M-B1 | `enabledModules` added to `touchesPrivilege`, and `assertCanGrantRoleAndPerms` now also runs when it is present — so a member cannot re-scope themselves, and a non-admin cannot re-scope an admin. |
| M-B2 | `removeMember` calls the same `assertCanGrantRoleAndPerms` ceiling the update path already used, before the history probe. |
| M-D1 | `member.access_updated` now has a listener: `use-realtime-sync` calls `refreshUser()` and invalidates the whole cache, because `spaceScope`/`webScreens` decide what every cached list was allowed to contain. |
| M-D2 | New `MemberEventsService` (gateway) → `member_changed` → `member.changed` broadcast to the org room, wired into all **four** call sites that change a roster (member edit, member remove, invitation create, invitation revoke, join-request approve). One `MEMBER_KEYS` list in `use-realtime-sync` so the server and the screens cannot drift. |
| M-D3 | Join-request approval also invalidates `orgMembers` and `orgContacts` locally. |
| M-D4 | `removeMutation` and `revokeInviteMutation` are optimistic — shared `dropRowOptimistically` / `restoreSnapshot` helpers, snapshot rollback on error, `onSettled` refetch so the server has the last word. |
| M-E1 | One `lib/role-badge.ts` keyed on the **canonical** role, legacy names folded in via the shared `normalizeRole`. All three copies deleted. |
| M-F1 | Real error branch with a retry button, ahead of the empty state. |
| M-C1 | The four dialogs are `dynamic(..., { ssr: false })`. |
| M-C2 | `take: 500` on the contacts directory query. |
| M-F2 | `ROLE_COLOR_FALLBACK = hsl(var(--muted-foreground))` replaces both `#6b7280` literals. |

### Bugs found *while* fixing (not in the original report)

- `nav-user.tsx` had **no `EMPLOYEE` entry** in its role map, so every employee fell
  through to `roleBadgeStyles.ADMIN` and wore a blue *admin* badge in the sidebar.
- The same badge rendered `{user.role}` — the raw enum, `EMPLOYEE`, untranslated in
  all five locales.
- `members/[id]` keyed on `DISPATCHER` / `TECHNICIAN` exclusively, so **every** real
  member hit the fallback; it only looked right by luck.

All three are gone with the single `roleBadge()` source. New key `members.roles.customer`
added in all five locales (the CUSTOMER role had no label anywhere).

## Tests

`users.service.member-audit.spec.ts` — 6 cases covering both High findings and their
negative controls (an admin *can* still do each thing; the last-admin guard still holds).

## Verdict

**PASS WITH FIXES** — pending exit gate #2, the two-session live-sync demonstration.
