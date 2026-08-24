# Area 08 — Assets

Routes: `/assets`, `/assets/[id]`, plus a space's Assets tab and the asset-kind editor.
Assets are **usage-billed** (10 free per space, then €1.20 → €0.30 on a graduated ladder),
so the counting logic is money.

Status: **All six passes run. 1 finding fixed**, 1 open question. 0 Critical, 0 High, 1 Medium.

---

## A. What this feature is (from the code)

**In one paragraph:** an Asset is any thing an organization keeps records against — a
machine, a vehicle, a flat. It belongs to an **AssetCategory** (the "kind"), which belongs
to a space, and that chain is how an asset reaches a bill. It carries a status
(ACTIVE / INACTIVE / MAINTENANCE / **RETIRED**), a maintenance history of completed jobs, an
activity log, a money ledger, and free-form typed rows defined per kind. A client can be
invited to see one specific asset through the portal.

---

## Findings

| ID | Sev | Pass | Title | Status |
|----|-----|------|-------|--------|
| AS-B1 | M | B | Hard-deleting an asset destroyed its maintenance history, behind a read-level permission | **fixed** |

### AS-B1 — the record's value was disposable

`AssetsService.delete` read `_count.tasks`, and on finding history it **nulled
`Task.assetId` on every one of those jobs** and then hard-deleted the row. Permanently. An
asset register whose entire purpose is "what has been done to this machine" would lose
exactly that, and the jobs would silently stop pointing anywhere.

Three things made it worse than the equivalent elsewhere:

- **The permission was `canViewAllTasks`** — the read/manager flag. Every other permanent
  delete in the product requires `canManageUsers`: spaces, members, org settings.
- **No emptiness probe.** The space purge refuses a non-empty space and names what is in the
  way; member removal runs a 14-table history probe. Assets checked the count and deleted
  anyway.
- **The right answer already existed.** `RETIRED` is a first-class status, and
  `BILLABLE_ASSET_WHERE` is literally `{ status: { not: 'RETIRED' } }` — retiring an asset
  keeps the record *and* stops the billing. That is what "we're done with this machine"
  should do.

**Fixed**: delete now refuses an asset with jobs against it and says to retire it instead;
`DELETE /assets/:id` and both money-ledger writes moved to `canManageUsers`.

---

## Verified good (checked, no finding)

- **The billing predicates are shared, documented and tested.** `BILLABLE_ASSET_WHERE`,
  `BILLABLE_CLIENT_WHERE` and `BILLABLE_PORTAL_WHERE` live in `packages/shared`, and
  `usage-pricing.spec.ts` asserts their exact shape — so a change to what counts cannot be
  made silently in one service.
- **The bill is computed without an N+1.** `org-bill.service.ts` fetches seats, spaces,
  asset kinds and the three usage counts in one parallel batch and folds per-kind asset
  counts onto spaces in memory, with a comment explaining that Prisma cannot group by a
  relation's column.
- **A stale module key on a space is filtered against the catalogue on the way into the
  bill**, so a retired key can never appear as an invoice line nobody can switch off.
- Asset reads and writes are org-scoped with an explicit `ForbiddenException` on a
  cross-tenant id, and there is a dedicated `AssetAccessService.assertMay`.

## Open questions

- **An asset with no `categoryId` is billed to nobody.** The bill reaches a space through
  `asset → category → space`, so an uncategorised asset falls out of every space's ladder and
  is free. There is an `/assets/orphans` endpoint and a UI card for re-homing them, so the
  state is known and surfaced — but nothing states whether "uncategorised is free" is the
  intended pricing or an accident, and a customer could keep a register uncategorised
  indefinitely. A pricing decision, not a code one.
  > Related: before the Area 03 fix, purging a space cascade-deleted its asset kinds and
  > turned every asset in it into an orphan — which would have silently stopped billing
  > them. That path is now blocked, but it is how the property first surfaced.

## Verdict

**PASS WITH FIXES.**
