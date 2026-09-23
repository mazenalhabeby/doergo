# Access — every tile carries its own gate

There is no widget-level permission. The rail appears when **two or more** of
its tiles do, and each tile answers for itself.

---

## The gates

| Tile | Gate | Scope |
|---|---|---|
| Messages | Option `live_chat` | org |
| Credentials | `canAssignTasks` | **in space** — see `FINDINGS.md` §3 |
| Sync | offline mode on for the org | org |
| Documents | everyone, about themselves | — |
| Sign a document | everyone | — |
| My equipment | module `assets` | per space |
| Overtime | Option `overtime` | org |
| New job | `canCreateTasks` | per the endpoint |
| Log expense | **custody on the receipt's date** | per asset |
| Scan card | module `crm` | per space |
| Send document | `canIssueDocuments` | per the endpoint |
| Add client | module `crm` + `crmEditInfo` | org role only |

---

## Three kinds of gate, and they are not interchangeable

**A permission** says who may look.
**A module** says whether the organization bought the thing at all.
**Custody** says whether this is your van.

`manage-rows.ts` already makes the first distinction explicitly:

> "A permission says who may look; a module says whether the organization
> bought the thing at all, and the two are different questions."

⚠️ **Custody is the third and the app has it right already.** §3.13: *"Filing
is authorised by custody on the receipt's date, never by `canManageAssets` — a
driver is not an asset manager and never will be."* The Log expense tile
inherits that rule; it does not restate it.

---

## Scope is per-endpoint, not per-widget

`orgWide` in the table means *"a grant held in ONE space is not enough"*, and
the file is clear about who decides:

> "because the endpoint behind it decides that, not this file"

| | |
|---|---|
| `@RequirePermission` → `orgWide: true` | Members, Invitations, Join requests |
| `@RequirePermissionInSpace` → `orgWide: false` | Attendance, Credentials, Asset contract |

⚠️ Getting this backwards produces the web navbar's bug in reverse: a tile that
opens to a 403, or a tile withheld from somebody who could have used it.

---

## ⚠️ Add client is org-role-only, and that is a trap

`resolveCrmCaps(systemRole, permissions)` takes a **flat** `PermissionSet`. A
space-scoped sales role grants nothing while looking configured — §3.11's own
warning, and confirmed in `packages/shared/src/types/permissions.ts`.

So the Add client tile is correct as written, but it will be absent for members
whose CRM role was granted in a space. **That is the resolver's behaviour, not
the tile's**, and it should not be worked around here.

---

## The member who qualifies for one tile

Gets no rail at all — `STATES.md` ⑤. Their one destination lives on the screen
it belongs to, or in the Manage list.

⚠️ Per §2.4 rule 2 the key stays in the stored layout. A member who gains a
second module gets their rail back without touching the picker.

---

## And nothing here is visible-then-refused

§2.4 rule 4. A tile checks its module **and** its permission **and** its scope
before it draws. The whole point of a rail of doorways is that every door
opens.
