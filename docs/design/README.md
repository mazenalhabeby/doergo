# The home screen — design handoff

Eight widgets for the HBCField mobile home screen, worked out from
`docs/home-widgets.md` and measured against the code in this repository.

**This folder contains no application code and nothing here has changed any.**
It is a specification: eight folders of findings, specs, states and access
rules, plus one shared icon set. An implementer should be able to work from it
without this conversation.

```
docs/design/
  README.md          ← you are here
  icons/             55 marks, 7 files, one construction law
  shift-clock/       ①  §3.1
  my-work/           ②  §3.2 §3.3 §3.5
  my-route/          ③  §3.4
  crew/              ④  §3.6 §3.7 §3.8
  needs-you/         ⑤  §3.14 §3.15 §3.19 §3.21
  shortcuts/         ⑥  §3.27 + six tiles
  documents-due/     ⑦  §3.16
  clients/           ⑧  §3.11
```

Visual reference, every state drawn at 350–390pt:
**https://claude.ai/artifact/9GcjYhxdrUEaL7NAVstB7U** (private)
The summary boards are **★ The catalogue, closed** and **★ The whole home
screen**.

⚠️ **An implementer cannot see that canvas** — it is a page on claude.ai, not a
file here. **`BOARDS.md` maps every board to the files that specify it**, and
has the prompt to paste when asking for one. Ask by **path and section**, never
by board title.

---

## 1. What happened to the catalogue

`docs/home-widgets.md` lists 27 widgets. Nine rows survive.

| Outcome | Count | Rows |
|---|---|---|
| **Widgets** | 8 | §3.1 · §3.2 · §3.4 · §3.6 · §3.11 · §3.14 · §3.16 · §3.27 |
| **Folded** into one of those | 6 | §3.3 §3.5 · §3.7 §3.8 · §3.15 §3.19 §3.21 |
| **Tiles** in the shortcuts rail | 6 | §3.17 §3.18 §3.22 §3.23 §3.24 §3.26 |
| **Dropped** | 2 | §3.9 §3.10 |
| **A full page, later** | 2 | §3.12 §3.13 |
| **A state** of §3.1 | 1 | §3.20 |
| **Parked** — no screen exists | 1 | §3.25 |

Every fold is argued in the receiving folder's `README.md`. The two drops and
the page were the owner's calls.

⚠️ §2.1's promise — *"anyone can read one file and know the whole set"* — is
the reason the folds happened. Four registry rows that are each absent most
days are four things to keep consistent for a screen that shows one of them.

---

## 2. Start here — six bugs that are worth fixing on their own

None of these needs a widget. All six are in code that ships today.

| | Where | What |
|---|---|---|
| **1** | `attendance.service.ts` · `getActiveEntries` | `prisma.timeEntry.findMany` with an `orderBy` and **no `take`**, on a route documented *org-wide*. ~148 rows on every home render at twelve sites. `listNoShows` in the same file uses `take: 200`. |
| ~~**2**~~ | ~~`admin-dashboard.tsx`~~ | **STRUCK — closed as a bug, reopened as a requirement.** `admin-dashboard.tsx` was deleted with the four old home screens, so nobody can hit `if (rostered.size === 0)` any more. The correct behaviour is specified in `crew/FINDINGS.md` §1 and is built **with ④ Crew**: when `rostered.size === 0`, drop the `/n` and render `6 · on the clock right now`. ⚠️ Do not reimplement the collapsing denominator on the way. |
| **3** | `route-nav.ts` · `supportsMultiStop()` | **Exported and never called.** Apple Maps and Waze users press *Start navigation*, are told it opens the whole route, and get turn-by-turn to stop one. `navApp` defaults to `'apple'` on iOS. |
| **4** | `pending-summary.ts` · `summarisePending()` | Drops `REJECTED` and `forMember`. A rejected document reads as a missing one, so the member photographs the same cut-off card again. |
| **5** | `tasks.controller.ts` → `getStatusCounts` | `canAssignTasks` is passed in and the service neither declares nor destructures it. Silently dropped. |
| **6** | Design tokens | White on `accent-lift #14a586` measures **3.11:1** in light mode. `shift-clock/TOKENS.md` has the fix. |

Full write-ups: `crew/FINDINGS.md` §1–2, `my-route/FINDINGS.md` §4,
`documents-due/FINDINGS.md` §1–2, `shift-clock/TOKENS.md` §3.

---

## 3. Three changes to shared code, before any widget

### 3.1 `anyOf` on the registry row — `needs-you/REGISTRY.md`

§2.1's row has one `permission` key. **Needs you** appears when the viewer
holds any one of four unrelated grants.

```ts
requires: { anyOf: ['canViewAllTasks', 'canManageAssets', 'canManageUsers'] }
```

⚠️ Not a `canShow(user)` predicate. §2.1's value is that the registry is
readable as data, and §2.4 rule 1 only holds if entitlement **is** data.

### 3.2 One destination table, three surfaces — `shortcuts/DESTINATIONS.md`

`apps/mobile/src/lib/manage-rows.ts` already holds ten destinations in exactly
the shape a tile rail needs. **Twelve member-facing screens have no registry
entry anywhere.** Add them to the same array plus two fields:

```ts
home?:  true,              // eligible for the home rail
badge?: 'documents.due',   // where the count comes from
```

⚠️ The rail must read that array, never a copy. The file already records what
drift cost: *"that is how a member comes to see Clients on the web and not on
the phone."*

### 3.3 The headline rule — `clients/SPEC.md` §2

`summarisePending()` solves *one line, several kinds* for documents. The
clients card needs the same rule for `REMINDER_KINDS`. Put it beside it in
`packages/shared` so the web gets both.

---

## 4. Two endpoints to build

| | For | Detail |
|---|---|---|
| `GET /crm/due` | ⑧ Clients | **`clients/ENDPOINT.md`** — full response shape, both queries, the scoping rule. Two indexed reads; the cold tail and the book's total ride along so no state costs a second call. The `/customers` screen wants it too. |
| `groupBy: 'summary'` on `/tasks/counts` | *(only if §3.9 ever returns)* | Three of §3.9's four figures are not in the endpoint it names. Not needed for anything in this folder. |

⚠️ **Clients cannot be built without `/crm/due`.** `clients/ENDPOINT.md` ends
with the honest alternative: if it is not going to be built, put Clients in the
shortcuts rail as a badged tile and leave it there.

---

## 5. Build order

**A · Land the bugs from §2.** Independent, small, and every one of them
improves a screen that exists. ⚠️ **Bug 2 is struck** — its subject was deleted;
it is now part of ④ Crew. **Bugs 1 and 5 are `apps/api`** and held. That leaves
**4** and **3**, in that order: a rejected document reading as a missing one is
the worst of the set for a real member.

**B · The three shared changes from §3.** Nothing visible changes. They are
what the widgets stand on.

**C · The icon set.** Move `icons/` into
`apps/mobile/src/components/glyphs/` and fold `index.ts` into that folder's own.

⚠️ **`glyphs/`, not `home/`** — this folder originally said `home/`. The marks
are not the home screen's: the footer reads `tab-glyphs.tsx`, the tile rail is
used by three surfaces, and `components/home/` was where four dead screens and
72 require cycles lived until they were deleted. A family kept beside one of
its consumers gets copied by the next one.
**No edits to any `.tsx`** — every `import … from './glyphs'` is already
written for the destination, which is why none of them compile where they sit.
Delete `OnBreakGlyph`; `glyphs.tsx` already has `BreakGlyph`.

**D · The widgets, in this order.** Each folder's own `README.md` has its
internal steps and a "stop here if you need to" point.

| | Widget | Why here |
|---|---|---|
| 1 | **⑦ Documents needing you** | Cost A and it means it. The component exists and is already well argued; this is a restyle plus two fields already on the wire. |
| 2 | **⑥ Shortcuts** | Depends only on §3.2. Gives twelve scattered screens a door. |
| 3 | **① Shift clock** | The most-used card in the app. Also where §3.20 overtime lands — see §7. |
| 4 | **② My work** | The second most-used, and the model for how access decides a widget three times. |
| 5 | **④ Crew** | Needs bugs 1 and 2 first, or it ships with a full bar and a heavy fetch. |
| 6 | **⑤ Needs you** | Needs §3.1. |
| 7 | **③ Today's route** | Needs bug 3 first. |
| 8 | **⑧ Clients** | Needs the endpoint and the three decisions in `clients/OPEN.md`. |

---

## 6. Rules that hold across every widget

These are not style. Each one came from something in this codebase.

1. **A widget is a registry row and a layout is an ordered list of keys.**
   §2.1, §2.2. No coordinates, no grid.
2. **Entitlement is asked once, filtered last, every render.** §2.3, §2.4 rule
   1. A stored key that is no longer allowed is skipped silently and **never
   deleted from storage**.
3. **Nothing is visible-then-refused.** §2.4 rule 4 — and in this set it goes
   further: a row you cannot see makes **no request at all**.
4. **Each widget fails alone**, and inside a multi-source widget each row fails
   alone too. `offline/tasks/list-failure.ts` is the model; three of its four
   branches are non-fatal.
5. **The verb is data.** Button labels come from `FlowStatus.label` and are
   organization-authored. Marks map to the **transition**, never to the
   wording.
6. **The organization's own icon and colour win** where it has them —
   `HeldAsset.asset.category` carries both and nothing renders either today.
7. **Caching is a question about shelf life, not a policy.** Presence and
   reminders are *now* questions and are never kept; a route plan, an
   obligation and a document are kept without hesitation.
8. **An empty state is a decision, not an absence.** Say which: *hidden*
   (normal, e.g. documents), *rendered with an invitation* (a route with stops
   and no plan), or *rendered as an all-clear* (a calm crew).
9. **Hidden is not removed.** §2.4 rule 2.

---

## 7. What is left

**§3.20 `overtime` → a state in `shift-clock`.** The only design work
outstanding. `OvertimeRequestStatus` runs `PENDING_TECHNICIAN →
PENDING_APPROVAL → APPROVED`, `getActive()` returns **one** live request, and
`timeEntryId` is deliberately **not unique** — *"Overtime is a LOOP… a unique
index gave a shift exactly one overtime record ever, so the second round had
nowhere to be written."* The card must print the round number.

⚠️ It is not a tile. Somebody asked to stay ninety minutes cannot be left to
notice a badge.

**§3.25 `portal-requests` → parked.** No portal screen exists under
`apps/mobile/app/(app)/`. A doorway needs a door. Not a design decision.

**Three judgements, written up and not made** — `clients/OPEN.md`:
whether **Done** gets an undo (recommended: yes, the app already uses a
30-second undo for attendance approvals), whether **"going cold"** is a
constant or a setting, and whether the clients headline counts **reminders or
clients**.

---

## 7a. Briefing an implementer

Ask by **path and section number**. A board title means nothing outside the
canvas — `BOARDS.md` explains why and has a worked example.

```
Read docs/design/README.md and docs/design/<widget>/ in full.
Build <FILE>.md §<n> … §<n>, in that order.
The marks are already in apps/mobile/src/components/glyphs/<x>-glyphs.tsx.
Follow every ⚠️ line literally — each one is a bug that has happened.
Do not invent states that are not in STATES.md.
```

The last two lines matter. Roughly a fifth of every file is ⚠️ warnings, each
traced to something in this codebase, and every widget's states are a closed
list.

---

## 8. How each folder is laid out

Every widget folder has a `README.md` with the one idea, the build order and a
**How to check it worked** list. Beyond that:

| File | When it appears |
|---|---|
| `FINDINGS.md` | Always. What was measured in the repo, with file and line. |
| `SPEC.md` | Always. Anatomy, data, copy. |
| `STATES.md` | Always but one. Every state, and the ones that are deliberately **not** states. |
| `ACCESS.md` | When access is more than one key. |
| `ENDPOINT.md` · `REGISTRY.md` · `DESTINATIONS.md` | When the widget needs something built **outside itself**. Read these first. |
| `SCALE.md` | Crew only — the two rules that keep it finite at 148 people. |
| `DATA.md` | Route only — where every number comes from. |
| `TOKENS.md` · `ISSUES.md` | Shift clock only. |
| `OPEN.md` | Clients only — decisions deliberately left open. |

And two at the top level: **`BOARDS.md`** (canvas board → the files that
specify it) and this README.

**8,068 lines** across nine folders.

---

## 9. The icon system

`icons/README.md`. Fifty-five marks in seven files, one construction, all
typechecked against `apps/mobile/tsconfig.json`.

The law, quoted from the app's own `glyphs.tsx`:

> "ONE colour at four opacities — .2 for what sits behind, .3 for the body, .5
> for detail, .95 for the thing that names it"

> "`contrast` is the colour PUNCHED out of a solid mark, and it must be the
> exact background the glyph sits on"

⚠️ **Five marks already exist and are reused, not redrawn** — `MessagesGlyph`,
`SendDocumentGlyph`, `BreakGlyph`, `SupportGlyph`, `DocumentsGlyph`. And
`EquipmentGlyph` stays alongside `MyEquipmentGlyph`, because *equipment* and
*the box that is yours* are two claims.

The README also records the three marks that took more than one attempt and
why, because the same mistakes are easy to make again.

## Messages: icons and motion (2026-10-16)

`messages-motion.html` (+ `messages-motion@2x.png`): the web Messages page with the
**Gradient ink** icons (Solar shapes, CC BY 4.0, painted sky → blue → indigo) and eleven
motions. Approved by the user; live at https://claude.ai/artifact/DECL6UnyhVTEXq7DPrwbxN.
The icons live once in `packages/shared/src/icons` for the web and the phone.
