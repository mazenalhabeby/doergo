# Clients — design handoff

Widget **§3.11 `crm-today`** of `docs/home-widgets.md`. One registry row, no
folds.

> **Scope.** One widget — and **one endpoint**, which is the larger half of the
> work and the reason nothing here can be built without it.

---

## The one idea

**Three parts, in one sentence each: what is owed, what is drifting, and the
way through to the book.**

```
5   need you              ← reminders, with the verb first
4   going cold            ← nobody has touched them in a month
214 clients            ›  ← always there, whatever the rest says
```

And the rule that makes the first part work: **the headline is read from the
data, never assumed.** A reminder can be a call, an email or something else, so
*"owed a call"* is wrong the moment one of them is an email.

It is also **the only widget in the catalogue whose rows finish the errand
where they stand** — a jade disc that rings or writes, and a tick that closes
the reminder. Every other card is a doorway.

**Read `ENDPOINT.md` first.**

---

## The files

| | |
|---|---|
| **`ENDPOINT.md`** | **Read first.** The one thing to build, why the client cannot do it, and what to do if it is not built. |
| **`FINDINGS.md`** | Ten, measured in the repo. |
| **`SPEC.md`** | The three parts, the headline rule, the row, the two discs, the All row. |
| **`STATES.md`** | Seven states, and two things that are deliberately not states. |
| **`ACCESS.md`** | The CRM caps, and two traps that are real. |
| **`OPEN.md`** | **Two decisions I did not make.** Settle them before building. |
| **`../icons/`** | `crm-glyphs.tsx` — five marks; two more are reused, not redrawn. |

Visual reference — seven states at 350pt:
**https://claude.ai/artifact/9GcjYhxdrUEaL7NAVstB7U**
(private; board `⑩ Clients — owed, going cold, and the book`)

---

## Build in this order

### 0. Settle `OPEN.md`

Whether **Done** gets an undo, and whether **30 days** is a constant or a
setting. Neither is a detail: the first decides whether this card can lose
something, and retrofitting undo onto a queued write is harder than it looks.

### 1. `GET /crm/due` — the whole endpoint

`ENDPOINT.md`. Two indexed reads, one response, the cold tail and the book's
total riding along. Nothing on the phone changes yet.

⚠️ Scope it with `resolveCrmCaps(...).view`, and exclude `isContact` and
`isPortalResident` from both halves.

The `/customers` screen wants this for its own "today" tab, so it is not built
for one card.

### 2. The headline rule — in `packages/shared`

`SPEC.md` §2. Beside `summarisePending()`, because it is the same rule and the
web will want it.

### 3. The glyphs

`../icons/crm-glyphs.tsx`. `CallGlyph` and `FinishGlyph` are **reused** from
`work-glyphs.tsx` — the act of ringing, and "this is complete". Not redrawn.

### 4. The card — rows and the All row

`SPEC.md` §3–6. Start with `CALL` and `EMAIL` rows; `OTHER` changes the row
shape and can follow.

### 5. `OTHER`, shared reminders, offline

The three states that change the row rather than the words.

**Steps 1 and 2 are worth doing without the widget.** The endpoint gives the
clients screen a "today" tab, and the headline rule is a bug fix waiting to
happen in the documents reminder's neighbour.

---

## Rules that are not style

1. **The headline is computed from the kinds.** Never a fixed phrase.
2. **The verb leads; the reason follows as text.** *"a reminder row must always
   render its reason"* — and a glyph cannot say which direction in time it
   points.
3. **Two discs is the ceiling.** A third turns a reminder into a form.
4. **`OTHER` has no act**, so it has one disc and the note becomes the title.
5. **A shared reminder says so.** One call clears it for three people.
6. **The All row is on every state**, with or without its number.
7. **Reads are never cached; writes are always queued.** A stale "owed a call"
   list makes somebody ring a client twice.
8. **`isContact` and `isPortalResident` are not clients** — anywhere on this
   card.
9. **Never call `customersApi.list()`.** The All row is a route.

---

## How to check it worked

- Set one call reminder and one email reminder. The headline must read
  **"2 need you"**, not "2 owed a call".
- Set three call reminders. It must read **"3 owed a call"** — and the sub-line
  must still say how many are late.
- Set an `OTHER` reminder. The note is the **title**, the client is the second
  line, and there is **one** disc.
- Set a reminder with `reminderAssigneeId: null` on a client with three
  managers. All three see it, and the row says **"any of 3 managers"**.
- Tick Done. Whatever `OPEN.md` §1 settles on, the member must be able to get
  it back.
- Turn off the network. The tick still works, `tel:` still works, the All row
  still works, and there is **no timestamp** on the list.
- Give a member `canViewAllTasks` and no CRM keys at all. They will see the
  whole client book. That is `ACCESS.md` trap 2, and it is working as written —
  check it is what you meant.
