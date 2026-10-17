# Web UI pieces — the looks that differ (for a mockup, 2026-10-17)

Phase 4 of `docs/plans/refactor-autonomous-2026-10-17.md`. Copies that render **identically** were merged
into shared components with no visual change (proof: `components/ui/__tests__/ui-pieces-same-markup.spec.tsx`):

| Shared piece | Replaced copies |
|---|---|
| `ChoiceChip` `pill` (`components/ui/choice-chip.tsx`) | 3 — report builder timesheet columns, measures, group-by (`reports/reports-page-dataset.tsx`) |
| `ChoiceChip` `iconPill` | 2 — document control role picker (`documents/all/_components/document-control.tsx`), logbook entry type (`assets/[id]/_components/log-entry-dialog.tsx`) |
| `EmptyNote` (`components/ui/empty-note.tsx`) | 9 — asset record panels (jobs, activity, money ×2, logbook, faults, custody, a removed table), `sign/page.tsx` |
| `PageNotice` | 3 — no-access pages: `my/time-off`, `my/attendance`, `members/phone-sync` |
| `DashedEmptyBox` | 3 — `portals/page.tsx`, `assets/page.tsx`, member holdings tab |

Everything below **differs on screen**, so it was left alone. Each row ends with a proposed single look —
choosing it is a visual change and needs your OK.

## 1. Pagers — 8 looks, 0 merged

| Where | Look |
|---|---|
| `components/list-page.tsx` `ListPager` (invitations, join requests) | "Page 2 of 5" left; outline buttons **with text + chevrons**; bordered footer `px-6 py-3` |
| `attendance/_components/tracking-tab-tracking.tsx:265` | same footer, but "Showing 1–25 of 80" and **text-only** buttons |
| `members/_components/members-table.tsx:111` | footer tinted `bg-muted/30`, `px-5`, small `h-8 text-xs` text buttons |
| `settings/audit-log/audit-log-page-inner.tsx:221` | no footer border, `mt-4`; **tiny 28 px icon-only** buttons, `text-xs` page label |
| `documents/all/page.tsx:165` | count ("80 documents") left, icon buttons around "2 / 5" |
| `components/assets/all-assets-list.tsx:153` | right-aligned icon buttons around "2 / 5", no label |
| `components/assets/asset-list-table.tsx:155` | right-aligned **text** buttons around "2 / 5" `text-xs` |
| `overtime/_components/rounds-list.tsx:112` | **centred**: Previous · "Page 2 of 5" · Next |
| `tasks/_components/tasks-pagination.tsx` | "Showing x of y" + **numbered page buttons** (5 visible), dark active page |

**Proposed:** `ListPager` everywhere (label left, outline text+chevron buttons), with an optional `showing`
line for tables that say "Showing x–y of z". Tasks keeps numbered pages as a `numbered` option.

## 2. Stat tiles — 7 looks, 0 merged

| Where | Look |
|---|---|
| `attendance/_components/stat-card.tsx:199` `StatCard` | big card `p-5 shadow-sm`, **coloured icon well** left (blue/green/amber/slate), uppercase title, 2xl value |
| `members/[id]/_components/performance-tab.tsx:62` `StatTile` | icon in a small **primary** square on top, 2xl bold value, label + optional delta |
| `my/time-off/my-time-off-page-helpers.tsx:22` `Stat` | bare icon on top (amber or muted), 2xl/sm value, 11 px label |
| `members/[id]/_components/holdings-tab.tsx:97` `Stat` | small `rounded-xl p-3`, uppercase label **above** an lg value, amber "out" tone |
| `invoices/_components/list/aging-summary.tsx:20` `Stat` | uppercase tracked label above an xl value **coloured by tone**; clickable variant |
| `employees/availability/schedule-and-time-off-page-helpers.tsx:14` `Stat` | number **left** (26 px, cover tone) + title/sub text right |
| `members/[id]/page.tsx` header stats, `reports` KPI cards | inline grids (not components) |

**Proposed:** one `StatTile { label, value, icon?, tone?, delta?, onClick?, size: sm | md }` — label above,
value below, optional icon top-left in a tinted well; tone colours the value. Availability's "number left"
layout stays its own (it is a summary row, not a tile).

## 3. Choice chips — 9 more looks

| Where | Look |
|---|---|
| `customers/[id]/customer-composer.tsx:94` | `rounded-lg` icon pill, off state has `bg-background` |
| `locations/[id]/_components/asset-kind-dialog-helpers.tsx:38` / `:84` | `rounded-full`, on = `text-foreground`; two sizes (`px-3 py-1.5 text-xs` / `px-3 py-1 text-[11px]`) |
| `members/[id]/_components/add-attendance-dialog-add-attendance.tsx:91,102,180` | `rounded-md`, off = `border-input … hover:bg-muted`; weekday squares `h-9 w-11` |
| `approvals/_components/no-show-decision.tsx:97` | `rounded-full px-3 py-1`, off = `text-foreground hover:bg-muted` |
| `issues/page.tsx:214` | `rounded-full px-2.5 py-1 text-[11px]`, off `hover:bg-accent` |
| `reports/reports-page-dataset.tsx:78` (Summary/Detailed) | `rounded-lg` — a two-way choice, really a `Segmented` |
| `components/access-fields.tsx:142` | `rounded-lg px-3 py-1.5 font-medium` |
| `components/attendance/break-fields.tsx:108` | `rounded-md px-2.5 py-1` |
| `components/assets/asset-status.tsx:73` | `h-8 rounded-md px-2 font-medium`, on = `text-foreground` |

**Proposed:** `ChoiceChip` with two shapes only — `pill` (rounded-full, `px-2.5 py-1 text-xs`) and
`iconPill` (adds an icon, `px-3 py-1.5 font-medium`); on = primary border + tint + primary text;
off = border + muted text, `hover:text-foreground`. Two-way choices (Summary/Detailed, single/range) use
the existing `Segmented`.

Not chips but **option cards** (a bordered row you pick, `border-primary bg-primary/5` when chosen): clock-in
section, away policy, no-shift section, portal tab, crew card hand-over, welcome wizard, clock-in picker —
seven copies of one idea with different padding and radio dots. **Proposed:** one `OptionCard`.

## 4. Status colour maps — 9 maps, 0 merged

| Map | Palette |
|---|---|
| portal requests `STATUS_STYLES` (`portal-detail-page-helpers.tsx:15`) | `bg-{c}-500/10 text-{c}-600`, task statuses (blue/purple/indigo/amber/red/emerald/slate) |
| sharing `STATUS_STYLES` (`invite-section.tsx:33`) | **bordered** `border-{c}-200 bg-{c}-50 text-{c}-700` |
| my time off `STATUS_STYLES` (`my-time-off-page-helpers.tsx:8`) | `bg-{c}-100 text-{c}-700` |
| phone sync `TONE` (`members/phone-sync/detail-panel.tsx:9`) | pill + dot pairs |
| presence `TONE` (`components/attendance/presence-day.tsx:20`) | bar + dot pairs |
| asset status `TONE` (`components/assets/asset-status.tsx:15`) | own palette |
| job time `TONE` (`tasks/[id]/_components/job-time-card.tsx:10`) | solid `bg-sky/green/amber-500` bars |
| aging `TONE` (`invoices/_components/list/aging-summary.tsx:28`) | text colours only |
| issues `SEV_DOT`/`SEV_TEXT` (`issues/page.tsx:27`) | duplicates shared `PRIORITY_COLORS` in different shades |

**Proposed:** six semantic tones (`neutral | info | success | warning | danger | primary`) → one class map in
`lib/status-tones.ts`, rendered by `ToneChip` as `bg-{c}-500/10 text-{c}-600 dark:text-{c}-400` (the most
used look); each domain keeps only its `status → tone` map. Issues read `PRIORITY_COLORS`.

## 5. Empty states — merged where identical; the rest

| Look | Copies |
|---|---|
| `EmptyState` in `locations/[id]/_components/section-header.tsx:48` — dashed `bg-muted/20` box, icon in a 56 px muted square, title + description + action | 9 importers |
| `portal-detail-page-helpers.tsx:35` `EmptyState` — same icon square, **no box**, `py-16` | 1 |
| `locations/space-card.tsx:57` — `CenteredNotice` `py-20` with a create button | 1 |
| `className="py-12 text-center"` blocks | 4 |
| `className="py-10 text-center text-sm text-slate-400"` | 3 |
| `rounded-2xl border bg-card py-12 text-center text-sm` cards | 2 |
| ~40 one-off `py-(8–20) text-center` blocks with their own padding | — |

**Proposed:** two looks only — `EmptyState` (the section-header one: dashed box, icon square, title,
description, action) for a section or page with nothing in it, and `EmptyNote` (one quiet line) inside a
panel or list. `slate-400` text becomes `text-muted-foreground` (it is the only hard-coded grey left).
