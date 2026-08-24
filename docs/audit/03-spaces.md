# Area 03 — Spaces

Routes: `/locations`, `/locations/[id]` (10 tabs), `/shared/[id]`.
Spaces scope modules, rosters, workflows, assets, billing **and** cross-organization sharing,
so this area's Pass B is the widest in the product.

Status: **All six passes run. All 6 findings fixed.** 1 High, 4 Medium, 1 Low.

---

## A. What this feature is (from the code)

**In one paragraph:** a Space is the unit almost everything else hangs off — it owns the
roster, the shift rota, the task types, the asset kinds, the customers and portals, the
attendance rules, and the module set the bill is computed from. It has a lifecycle
(Active → Archived → purged) where only the last step is irreversible and only an *empty*
space may take it. It can also be **shared with another organization**: an owner grants a
guest org a level (VIEW / CONTRIBUTE / CONTROL) plus per-facet flags (`showWorkers`,
`showAttendance`, `showTracking`, `showReports`, `allowRequests`), and the guest's session
carries those grants as `sharedSpaces`, which widen otherwise org-scoped reads.

### Server surface

| Method | Endpoint | Guard |
|---|---|---|
| POST/PATCH | `/locations`, `/locations/:id` | `canManageUsers` |
| GET | `/locations`, `/locations/:id`, `/locations/rosters`, `/locations/:id/members` | authenticated; **scoped in the service** by the caller's `spaceScope` + `sharedSpaceIds` |
| DELETE | `/locations/:id` (archive) | `canManageUsers` |
| DELETE | `/locations/:id/permanent` (purge) | `canManageUsers` |
| POST | `/locations/:id/members` | **`@RequirePermissionInSpace`** — "guard widens; service authorizes" |
| POST/PATCH/DELETE | `/locations/:spaceId/shares…` | `canManageUsers` + the `space_sharing` module |

---

## Findings

| ID | Sev | Pass | Title | Status |
|----|-----|------|-------|--------|
| S-B1 | **H** | B | "Empty" was under-defined — purge probed 8 of 18 relations, three of which lose data | **fixed** |
| S-B2 | M | B | `SpaceShare.spaceId` has no foreign key; purging cut off a partner org and left the grant dangling | **fixed** |
| S-D1 | M | D | Purge — the one irreversible operation — announced nothing | **fixed** |
| S-D2 | M | D | Cross-org share changes notified **neither** organization | **fixed** |
| S-C1 | M | C | Ten tabs (~6,400 lines) loaded eagerly for whichever one you open | **fixed** |
| S-F1 | L | F | Geofence circle still emerald after the brand moved to blue | **fixed** |

### S-B1 — what "empty" has to mean **(High)**

`purge` refuses any space with history, which is right. The probe counted **8** relations —
tasks, time entries, shifts, shift assignments, overtime, recurring templates, customers,
customer units. `CompanyLocation` has **18**. Three of the ten it skipped are not inert:

| Relation | `onDelete` | What purging actually did |
|---|---|---|
| `assetCategories` | **Cascade** | Deleted the space's entire asset taxonomy. Assets survive with `categoryId` NULL — which is precisely what the "orphan assets" card exists to mop up. Assets are also usage-billed. |
| `ownedWorkflows` | **Cascade** | Hard-deleted every task type the space owns. A `StatusWorkflow` can be offered to **other** spaces (`spaceOfferings`), and `SpaceWorkflow.workflow` is Cascade too — so those offerings vanish and `Task.workflowId` goes NULL on tasks in **other** spaces. A space with zero tasks of its own could break another space's board. |
| `sprints` / `epics` / `phases` | SetNull | Survive, silently detached from the space they belonged to. |

The dialog told the user the space was empty. It wasn't. **Fixed** by probing all five and
naming each one in the blocker message, so the user is told *which* history is in the way.

### S-B2 — a share is another organization's access

`SpaceShare.spaceId` is a plain `String` with **no relation to `CompanyLocation`**
(`schema.prisma:2478` region), so nothing cascades it. Purging a shared space therefore
revoked a partner organization's access with no notice to them, and left an `ACTIVE` grant
row pointing at a space that no longer existed — which `buildResolvedAccess` keeps loading
into that org's session forever.

**Fixed** two ways: an ACTIVE share now *blocks* the purge with "unshare first" — revoking
another company's access should be a deliberate act, not a side effect — and the leftover
PENDING/REVOKED rows are cleared inside the delete transaction.

### S-D1 / S-D2 — the lifecycle events with the biggest consequences were the silent ones

`locations.service.ts` announces `space_changed` on create, update and archive. **Purge did
not** (S-D1) — the one operation that cannot be undone was the one that left every other
admin looking at a space that no longer existed.

Sharing was worse: the entire space-sharing controller emitted **zero** events (S-D2). A
guest org's list kept showing a space they had just lost access to until their auth cache
expired, at which point it vanished with no explanation; and the owner's other admins never
saw a share appear or change.

**Fixed** with a `SpaceEventsService` whose `shareChanged()` announces to **both** sides.
The guest is the half that actually gains or loses something *and* the half not making the
request — which is exactly why it was the half that got forgotten.

> Worth recording how this nearly went wrong. The first version sniffed the org ids off the
> response (`res.data ?? res`). The five share handlers do not agree on a shape —
> `revokeShare` returns `{ success, guestOrgId }` with no `data` and no `spaceId` — so
> revoke, the mutation where somebody *loses* access, would have notified the guest and
> silently skipped the owner. The helper now takes what the caller can prove from its own
> token and route (`ownerOrgId` on owner routes, `guestOrgId` on guest routes) and fills
> only the counterpart from the server's result. Never from the request body: a guest org
> id taken from the client would let a caller push a refresh into an unrelated organization.

### S-C1 — ten tabs, one visible

`/locations/[id]` had **zero** `dynamic()` imports and ten static tab imports. Those tabs
reach ~6,400 lines with their dialogs — the asset-kind editor alone is 670, the rota 733 —
and the page opens on exactly one. All ten are now lazy.

### S-F1 — a colour left behind

`location-picker.tsx` drew the geofence circle in `#059669`, the emerald the brand was
before it moved to blue. Now a named constant with a comment explaining why it is a resolved
value and not `var(--brand-600)`: Leaflet paints on canvas and cannot read a CSS variable.

---

## Verified good (checked, no finding)

- **`sharedSpaces` is genuinely server-authoritative.** Built in `auth.service.ts:1265` from
  `SpaceShare where { guestOrgId: <token org>, status: ACTIVE }` — a client cannot influence
  it, and revoking flips the status so the grant drops out on the next resolve.
- **Each consumer filters by the facet it needs**, not by "is it shared": rosters filter on
  `showWorkers`, tracking looks up the specific grant. The flags are enforced where they are
  read, not assumed.
- **The `any`-body trap is already handled.** `updateShare` whitelists mutable fields with a
  comment noting that `ValidationPipe`'s whitelist does not apply to an untyped `any` body,
  so spreading it would let a caller override `ownerOrgId`.
- **Purge's other protections hold**: org-scoped lookup, default space and Remote space both
  refused, and the deletion is logged at WARN with the actor.
- **The space detail page is a thin 265-line shell** with all ten tabs extracted — the
  SOLID problem the members detail page had does not exist here.
- **i18n**: 715 distinct keys across 33 files, **0 missing** in de/es/fr/it.

> ⚠️ **Method correction.** My first Pass F run reported 5 missing keys in *all five*
> locales, English included. They were not missing — they exist as i18next plural forms
> (`memberCount_one` / `memberCount_other`), which `t("…memberCount", { count })` resolves at
> runtime. A naive leaf-key diff reports every pluralised key as absent. `WEB_AUDIT.md` now
> carries this in the Pass F method so the trap does not produce phantom findings again.

## Open questions

- An **archived** space's shares stay ACTIVE, so a guest org keeps access to a space the
  owner has archived. Defensible (archived is still visible to the owner) but it is not
  stated anywhere, and archive and purge now behave differently towards partners.
- `sharedGrants` is loaded per session with no `take`. Bounded in practice by how many orgs
  share with you; unbounded in principle, and it sits on the token-validation hot path.

## Verdict

**PASS WITH FIXES** — the High was silent data loss with cross-space blast radius, reachable
from a button labelled "delete this empty space".
