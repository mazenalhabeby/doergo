# Area 10 — Reports & Analytics

Routes: `/reports`, plus `/analytics/*` (catalog, run, timesheet, saved reports, schedules).

Status: **All six passes run. 1 finding fixed.** 0 Critical, 0 High, 1 Medium.

---

## A. What this feature is (from the code)

**In one paragraph:** a semantic registry defines seven datasets (attendance, tasks, service
reports, leave, parts, asset maintenance, cycle time), each with named dimensions and
measures. A user composes a definition — dataset, dimensions, measures, filters, date range,
sort, limit — and a query engine turns it into one parameterised SQL statement. Definitions
can be saved, shared org-wide, and scheduled.

---

## Findings

| ID | Sev | Pass | Title | Status |
|----|-----|------|-------|--------|
| R-C1 | M | C | recharts loaded eagerly — the one page in the app where it was not split | **fixed** |

### R-C1 — the charting library nobody else shipped eagerly

`/reports/page.tsx` imported recharts at the top of a 720-line page. Every other consumer
splits it: the member-detail Performance tab loads it with `dynamic()` and carries a comment
explaining that recharts is the reason. This page missed the same treatment, so every visitor
paid for the library whether or not their report produced a chart.

Extracted to `_components/report-bar-chart.tsx` behind `dynamic(…, { ssr: false })`.

> The palette had to move to its **own** module, not into the chart component: the stat cards
> use the same colours, and importing them from the chart file would have pulled recharts
> straight back into the page and silently undone the split.

---

## Verified good (checked, no finding)

- **The query engine is genuinely safe**, which is the claim that most needed testing since
  it builds SQL from a user-supplied definition and runs it through `$queryRawUnsafe`:
  - the **organization scope is always the first bound parameter** — `ds.orgColumn = $1` —
    added before anything the caller asked for;
  - every dataset, dimension, measure and filter **field** is resolved through the registry
    and rejected with a 400 if unknown, so only registry-authored SQL fragments are ever
    interpolated;
  - filter **values** are bound parameters, never interpolated, including the `= ANY($n)`
    array case;
  - the comparison operator is mapped through a ternary to `=`/`<>`, not passed through;
  - `ORDER BY` is validated against the columns actually selected;
  - `LIMIT` is clamped to 1–5000 and numeric.
- **Access is a deliberate OR-guard.** `ReportAccessGuard` grants on admin **or**
  `canViewAllTasks` **or** `canViewReports` (org-wide or in any space), with a comment
  explaining that the standard `PermissionsGuard` is AND-only and that a
  Show-in-Management member who is not a full manager should still be able to build reports.
  > My first pass recorded "no permission guards on reports" — wrong. The guard is applied at
  > **class level** via `@UseGuards`, which a grep for `@RequirePermission`/`@Roles` does not
  > see. Always check the class decorator before concluding a controller is ungated.
- `@RequirePlan('reports_builder')` and `@RequirePlan('report_scheduling')` are both real
  add-on keys, now permanently checked by `gating-keys.spec.ts`.

## Open questions

- **`canViewReports` is effectively "read everything in this organization".** The engine
  scopes by org and nothing else, so anyone passing the guard can group attendance by person,
  read every client, every asset ledger, every task. The guard's own comment accepts this
  ("reading is safe to widen; the report data itself is still org-scoped downstream") and it
  is a coherent position — but the capability is granted to non-managers through the Access
  Builder under a name that sounds narrower than it is. Worth renaming or narrowing, and a
  product call either way.
- `GET /analytics/timesheet?userId=` returns one named person's day-by-day attendance to
  anyone with report access. Consistent with the point above rather than separate from it: if
  the engine can group attendance by user, gating the timesheet harder would be theatre.

## Verdict

**PASS WITH FIXES.**
