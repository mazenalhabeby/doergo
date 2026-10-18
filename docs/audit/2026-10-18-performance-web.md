# Web + console performance audit — 2026-10-18

Branch `refactor/code-audit-2026-10`. Production build measured with `pnpm build:check` (never a bare
`next build`). Shared JS for every route: **107 kB**.

## Fixed

| Route | First Load JS before | After | Cause |
|---|---|---|---|
| `/settings/billing` | 317 kB | **188 kB** | `explainer-button` → `i18n/explainers.ts` imported `@/i18n`, which carries the whole English catalogue (387 KB raw) into the page chunk |
| `/members/[id]` | 298 kB | **193 kB** | five tabs that only render when opened were imported statically — and `page.tsx` still imported all six plus ~35 other unused names left by the split |

- **`@/i18n` → the global `i18next` instance** in `i18n/explainers.ts` and six dashboard modules
  (`workspace-box-*`, `presence`, `dashboard-activity`, `helpers`). `@/i18n` exports that same instance and the
  root layout initializes it before any page module runs, so behaviour is identical. Three dashboard specs now
  `import '@/i18n'` themselves, as the layout does; the pinned box snapshots match without rewriting.
- **Member tabs** (statement, attendance, locations, schedule, holdings) load with `next/dynamic` from
  `members/[id]/member-tabs-lazy.tsx`, and `useWarmMemberTabs()` fetches their code right after the first paint
  (`useAfterFirstLoad(1)`) — switching tabs normally finds the code already loaded.
- **Unused imports, app-wide: 116 files, ~1,600 lines** (`tools/prune-unused-imports-web.cjs`). This is a
  performance fix, not tidiness: webpack keeps an imported module in the route chunk even when nothing from it is
  used, because app source is not marked side-effect free. Modules that run code on import (`@/i18n`, leaflet,
  sentry, polyfills, CSS) keep a bare `import`. The other routes moved by ±1 kB (chunk regrouping).
- `billing-lock.spec` checked the PAGE files for `useBillingLock`, which since the split lives in each page's hook —
  it passed only because of a dead import. It now reads `use-tasks-page.ts` / `use-members-page.ts`.

## Checked and fine

- **Query defaults** (`providers/query-provider.tsx`): `staleTime` 60 s, `gcTime` 30 min, no refetch on focus.
- **Context providers** (auth, socket, chat, command palette, breadcrumb, activity panel, tour): every value is
  memoized.
- **Long lists**: tasks, members, audit log, notifications are paged (≤ 200 rows) — no virtualization needed.
- **Console** (`apps/admin`): one route, 129 kB.
- **Requests in the first second** (manager, before the dev server stalled): dashboard 8, tasks 8, approvals 4,
  attendance 6, calendar 5, members 7 — all within the ≤ 8 budget. Calendar showed one duplicate
  `GET /approvals/count`; that query has a single reader with a 30 s `staleTime`, so the second call is a socket
  event (`APPROVAL_EVENTS`) arriving during the measurement, not the page.

## Left, with reasons

- **Realtime invalidation uses `refetchType: "all"`** (`hooks/use-realtime-sync.ts`): every socket event also
  refetches matching queries no screen is showing (they stay cached 30 min). `"active"` would cut background
  requests, but a page you return to would briefly show the older data before refreshing — a visible change, so
  it waits for a decision.
- **Heaviest routes now**: `/customers/[id]` 308, `/invoices/new` 293, `/tasks/[id]` 290, `/tasks` 283,
  `/assets/[id]` 276. Their weight is their own first screen (page chunks 94–118 KB raw), not stray imports; the
  next step would be lazy tabs/panels per page in the same way as the member page.
- **Request check incomplete**: the user's `next dev` on :3000 (running 22 h) stopped answering at 250 % CPU /
  2.7 GB during the run; it needs a restart. Admin pages and the remaining manager pages were not measured.
