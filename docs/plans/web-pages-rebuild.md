# Web pages rebuild — from the design boards

The shell (sidebar, top bar, account menu, clock, loading, toasts, fonts) is done (branch `feat/web-shell`). This
plan rebuilds every PAGE inside it from the design boards in `docs/design/web-redesign/*.dc.html`
(canvas https://claude.ai/artifact/R6XwLVLR3N1h5C4Vabdhx6).

## Rules

- **Nothing is lost.** Every page keeps every feature, permission, gate and data hook it has today; the rebuild
  changes how it looks and how it is laid out, not what it may do. Server, shared rules and hooks are reused.
- **One page per commit**, checked in the browser in light + dark and at phone width, web tests green.
- **DRY:** page pieces the boards repeat (page header, tabs, toolbar, list row, side panel, empty state, stat) are
  built ONCE in `components/page/` and used everywhere.
- **Tokens, never colours:** a page uses the theme tokens (`html.app-theme` in globals.css) or `shell-*`; a
  hard-coded `blue-*` is replaced when its page is rebuilt (787 today, a ratchet keeps them falling).
- **Performance:** the page-load budget (≤ 8 requests in the first second) holds on every page.

## Step 0 — done

- `html.app-theme`: the boards' jade, greys, lines and corners on every shadcn token, so all pages already wear
  the palette. Set by the dashboard layout only (public site and sign-in keep theirs).

## Order (board → today's route)

| # | Board | Route(s) today | Notes |
|---|---|---|---|
| 1 | Approvals | `/approvals` | one inbox, contained — sets the page pieces |
| 2 | Home (Home-Grid) | `/dashboard` | widgets on the block grid, per role |
| 3 | Tasks | `/tasks`, `/tasks/:id` | list/board/dispatch/map; record in a side panel |
| 4 | Job report | `/tasks/:id/report` | the sheet |
| 5 | Calendar | `/calendar` | |
| 6 | Time | `/attendance`, `/schedule`, `/overtime`, `/issues` | the easy version: Today · Who's off · Extra hours · Problems |
| 7 | People | `/members`, `/invitations`, `/team`, `/members/:id` | record in a side panel |
| 8 | Me | `/my/*`, `/settings?section=profile` | |
| 9 | Clients | `/clients`, `/clients/:id`, `/portals` | |
| 10 | Invoices + New invoice | `/invoices`, `/invoices/new`, `/invoices/:id` | |
| 11 | Documents | `/documents/*` | |
| 12 | Reports | `/reports` | |
| 13 | Company + Workspace settings | `/locations`, `/locations/:id` | |
| 14 | Settings | `/settings` | |
| 15 | Assets, Manage, Messages | `/assets`, `/manage`, `/messages` | no board of their own — the shared pieces |

Merging pages into tabs (the boards' 13-item menu) follows each page as it is rebuilt; old URLs redirect.
