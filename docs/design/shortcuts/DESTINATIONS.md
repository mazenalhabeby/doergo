# The destination table — one table, three surfaces

> Read this before `SPEC.md`. The rail is a view of a table, and **half of that
> table already exists**.

---

## What is already there

`apps/mobile/src/lib/manage-rows.ts`:

```ts
{ icon, labelKey, descKey, route, color, permission, orgWide, module? }
```

Ten manager destinations, filtered by `manageRowsFor(user)`, which checks the
permission with the right scope (`holdsOrgWide` vs `holds`) and the module with
`moduleAnywhere`.

**That is exactly the table a tile rail needs.** And its own comment already
states the rule this widget has to obey:

> "The tab and the list read the same array, so a member never opens a Manage
> tab to find nothing in it, and never sees a row that would refuse them."

⚠️ **The rail must read that array too.** A second gated list of the same
destinations is §2.4 rule 1 happening again — *"Entitlement is asked once …
asked separately they drift"* — and this file records what drift already cost:

> "a member can legitimately hold `crmViewOwn` in an organization that runs no
> CRM anywhere, and the row then led to a screen that could only ever be empty"

> "that is how a member comes to see Clients on the web and not on the phone"

---

## What is missing

The member's **own** screens have no table at all. Each is reached by ad-hoc
navigation from wherever somebody happened to put a link.

| Screen | File | Gate |
|---|---|---|
| Documents | `documents.tsx` | everyone, about themselves |
| Sign a document | `sign-document.tsx` | everyone |
| My equipment | `my-assets.tsx` | module `assets` |
| Messages | `chat.tsx` | Option `live_chat` |
| Sync | `sync.tsx` | offline mode on |
| Overtime | `overtime/` | Option `overtime` |
| Log expense | `asset-expense.tsx` | custody on the date |
| Equipment log | `asset-log.tsx` | custody |
| Scan card | `scan-card.tsx` | module `crm` |
| Send document | `send-document.tsx` | `canIssueDocuments` |
| Plan route | `route-planner.tsx` | a stop of your own today |
| Support | `support.tsx` | everyone |

**Twenty-two destinations that are not tabs.** Twelve of them have no registry
entry anywhere.

### And three that were going to be widgets

These arrived last, from the end of the catalogue. Each answers one question
with one number and a destination, which is the definition of a tile:

| Screen | Was | Gate | Badge |
|---|---|---|---|
| Time off | §3.18 | everyone | days booked ahead |
| Invoices | §3.24 | Option `invoicing` + `canViewReports` | overdue |
| Reports | §3.26 | Option `reports_builder` + `canViewReports` | none |

⚠️ **§3.26 is the reason this works.** It was *"the only widget needing
per-instance configuration"* — a saved report id held in the layout row. As a
**tile** it needs none of that: it opens the reports screen and that screen
remembers which report. The configuration problem disappears with the widget.

⚠️ **§3.18's badge is not a balance.** `TimeOffRequest` has no allowance or
remaining-days field anywhere in the API, so a tile cannot show one. Days
booked ahead is computable from what is there; a balance is not.

---

## The change

Extend the same shape to the member's screens, and add **two fields**:

```ts
{
  icon, labelKey, descKey, route, color,
  permission, orgWide, module?,

  home?:  true,              // eligible for the home rail
  badge?: 'documents.due',   // where the count comes from, or none
}
```

Everything else the table already has.

### `home`

Twelve of the twenty-two. **Not every destination is a tile.**

Support and Equipment log are real screens nobody opens twice a week; Members,
Invitations, Schedules and Asset contract are set-up surfaces you visit when
something changes, not on a Tuesday. They stay in the Manage list and out of
the rail.

⚠️ This is a judgement, and it belongs in the table where it can be argued
about — not in the widget where it would be invisible.

### `badge`

The only genuinely new idea. A row names a count source, or names none.

| Row | Badge |
|---|---|
| Documents | required + expiring + awaiting signature |
| Time off | days booked ahead — **not** a balance |
| Invoices | overdue count |
| Sign a document | awaiting my signature |
| My equipment | items with something due |
| Messages | unread |
| Sync | queued + needs attention |
| Overtime | rounds waiting on my signature |
| Attendance | not arrived |
| Time-off requests | pending |
| Join requests | pending |
| Shift issues | open |
| Extra time | pending |
| everything else | none |

---

## Three surfaces, one array

| Surface | Reads |
|---|---|
| The **Manage tab** | `manageRowsFor(user)` — today |
| The **More sheet** in the tab bar | `manageRowsFor(user)` — today |
| The **Shortcuts rail** | `destinationsFor(user).filter(r => r.home)` |

`hasManageSurface(user)` already exists and is the same question asked for the
tab. The rail's question is one filter away.

⚠️ Do not let the rail own a copy of any gate. If the rail and the Manage list
ever disagree about who may open Clients, the bug is in this file and the fix
belongs here.

---

## What this does NOT change

- The Manage tab and the More sheet keep their current rows and behaviour. The
  rail is additive.
- `orgWide` keeps its meaning: *the endpoint decides that, not this file*. Join
  requests and Members stay org-wide; Attendance stays in-space.
- A row naming no module is not gated on one — *"most of Manage is the
  organization itself, which is never bought or unbought."*

---

## ⚠️ Never a tile for a tab

The tab bar already holds Home, Jobs, New job, Manage, Attendance, Time off,
Team and Profile, with a **More** overflow when there is a fifth slot's worth.

A tile that duplicates a tab is a second door to the same room, one of which
moves. `home: true` is refused for anything in `(tabs)/`.
