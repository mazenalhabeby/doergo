# Findings — measured in the repo

---

## 1. ⚠️ Half these destinations already have a registry, and the rail must use it

`apps/mobile/src/lib/manage-rows.ts` is
`{ icon, labelKey, descKey, route, color, permission, orgWide, module? }` with
`manageRowsFor(user)` filtering it — permission by the right scope
(`holdsOrgWide` vs `holds`), module by `moduleAnywhere`.

Its own comment is the rule:

> "The tab and the list read the same array, so a member never opens a Manage
> tab to find nothing in it, and never sees a row that would refuse them."

A second gated list for the rail is §2.4 rule 1 happening again. The same file
records what drift already cost twice:

> "a member can legitimately hold `crmViewOwn` in an organization that runs no
> CRM anywhere, and the row then led to a screen that could only ever be empty"

> "that is how a member comes to see Clients on the web and not on the phone"

See `DESTINATIONS.md`.

---

## 2. Twenty-two destinations are not tabs; twelve have no registry entry

The tab bar holds Home, Jobs, New job, Manage, Attendance, Time off, Team,
Profile, plus a **More** overflow.

Everything else under `apps/mobile/app/(app)/` is reached by ad-hoc navigation:
`documents.tsx`, `sign-document.tsx`, `my-assets.tsx`, `chat.tsx`, `sync.tsx`,
`overtime/`, `asset-expense.tsx`, `asset-log.tsx`, `scan-card.tsx`,
`send-document.tsx`, `route-planner.tsx`, `support.tsx`.

`MANAGE_ROWS` covers the ten manager screens. **The member's own twelve have no
table at all** — which is why they feel scattered, and why a rail helps more
than it looks like it should.

---

## 3. ⚠️ §3.17's permission is wrong, twice over

§3.17 says *"Who: `canViewMemberDocuments`"*.

`apps/api/gateway/src/modules/documents/documents.controller.ts`:

```ts
@Get('compliance')
// Space-aware, because assignment is: the board answers "why can this person
// not take the job", and that question now gets asked by someone who staffs
// one site. The service narrows the answer to the people they staff.
@RequirePermissionInSpace('canAssignTasks')
```

Not `canViewMemberDocuments`, and not org-wide.

And the web app already flags the oddity of the key itself:

> "Worth revisiting separately: 'can assign tasks' is a strange key for a board
> of personnel-document compliance."

⚠️ The web navbar refuses the item to space-scoped holders because *its* client
assumes org-wide:

> "A member holding `canAssignTasks` in a single space is refused there, so
> offering the item is a menu entry whose only outcome is a 403."

The **mobile** guard is the in-space variant, so the tile is correct on the
phone and the web navbar is the narrow one. Do not copy the web's rule.

---

## 4. ⚠️ §3.25 has no path to open

There is no portal screen anywhere under `apps/mobile/app/(app)/`.

**A doorway needs a door.** §3.25 is Cost C for the *screen*, not just the
endpoint, and it is left out of the rail until one exists. Parked, not counted
in the 18 → 15.

---

## 5. The tab bar already has an overflow, and it works the same way

`(tabs)/_layout.tsx`:

```
{/* The fifth slot, only when there is something to put in it. */}
{showMore && ( … )}
```

`splitTabs(visibleRoutes, manageRows.length > 0)` — the More button appears
only when the array is non-empty, and `inOverflow` exists because:

> "Being INSIDE the overflow has to look different from being anywhere else, or
> the bar shows nothing selected and the person cannot tell where they are."

**The pattern this widget needs is already in the app**, applied to a different
surface. The rail's *"hidden when fewer than two"* is the same instinct as the
More button's *"only when there is something to put in it"*.

---

## 6. Three catalogue rows fold, and the count is honest

| | Becomes |
|---|---|
| §3.22 `messages` | a badged tile |
| §3.17 `credentials` | a badged tile |
| §3.23 `sync` | a badged tile |

**18 → 15.** §3.25 is parked separately because it cannot be built at all yet,
so it is not part of that arithmetic in either direction.


---

## 7. Three more rows became tiles, and one of them stopped being hard

§3.18 `time-off`, §3.24 `invoices` and §3.26 `saved-report` each answer one
question with one number and a destination. That is a tile.

**§3.26 is the interesting one.** Its own catalogue entry says it is *"the only
widget needing per-instance configuration, which is why it is last"* — a saved
report id stored in the layout row, a picker to choose it, and a per-member
setting to keep in step.

As a tile it needs none of that. It opens the reports screen; the screen
remembers. **The configuration problem was a property of it being a widget.**

⚠️ **§3.18 cannot show a balance.** `TimeOffRequest` is
`{ id, technicianId, startDate, endDate, reason, status, approvedById,
approvedBy, approvedAt, rejectionReason, createdAt, updatedAt }` — there is no
allowance, no remaining days, nothing to count down from. Grepping the mobile
API and shared types for `balance`, `allowance` or `remainingDays` returns
nothing. The badge is **days booked ahead**, which is computable; a balance is
not, at any cost.

⚠️ **§3.24 must never offer "send".** Its own warning: *"a draft's PDF is
watermarked; only `ISSUED` produces a clean document."* The tile opens the
list, and the list knows which are drafts.

---

## 8. §3.20 is not a tile, and it is the one exception

`overtime` looks like it belongs here — a badge and a destination — and it does
not.

`OvertimeRequestStatus` is `PENDING_TECHNICIAN | PENDING_APPROVAL | APPROVED |
REJECTED | EXPIRED_NO_RESPONSE | EXPIRED_NO_APPROVAL | COMPLETED | CANCELED`,
and `overtimeApi.getActive()` returns **one** request or null. It is a live
conversation on a running shift, with the member answering in the middle of it.

⚠️ A member being asked to stay ninety minutes **cannot be left to notice a
badge.** The ask belongs on the shift clock, where the shift already is. A tile
for the same thing would be a second place describing one shift, disagreeing
for as long as the round is open.

**§3.20 folds into `shift-clock` as a state.** `OvertimeGlyph` is already drawn
and is used there, not in the rail.
