# Documents needing you — design handoff

Widget **§3.16 `documents-due`** of `docs/home-widgets.md`. One registry row,
no folds.

> **Scope.** One widget. The change that matters is **two fields in
> `packages/shared`**, not in the widget — see step 1.

---

## The one idea

**Most of this is already built, and already argued.**

`apps/mobile/src/components/documents-reminder-card.tsx` is 112 lines and a
third of them are the reasoning: one card, home screen only, nothing when
nothing is outstanding, no dismiss button, two tones, and —

> "**The line changes instead of multiplying.**"

That is right and it is kept. This folder does two things:

1. **Restyles it** into the Amazen language.
2. **Adds the two things its single line cannot say** — that a document was
   *sent back*, and that a signature is *somebody else's*.

Both of those are fields already on the wire and dropped before the row is
built.

**Read `FINDINGS.md` §1 and §2 first.** They are the work.

---

## The files

| | |
|---|---|
| **`FINDINGS.md`** | Seven, of which two are the design work and five are "already right, do not improve". |
| **`SPEC.md`** | The registry row, the anatomy, which obligation gets the line, and the two second lines. |
| **`STATES.md`** | Eight states. The eighth is the normal one. |
| **`../icons/`** | `doc-glyphs.tsx` — five marks, in the shared icon folder. |

Visual reference — all eight states at 350pt:
**https://claude.ai/artifact/9GcjYhxdrUEaL7NAVstB7U**
(private; board `⑨ Documents needing you`)

---

## Build in this order

### 1. `summarisePending()` — in `packages/shared`, not in the widget

`FINDINGS.md` §1 and §2. Two changes:

- take `rejected` as an input and give it a headline above `needed`, carrying
  `reviewNote`;
- stop dropping `forMember` from `toSign`.

⚠️ **This file is shared with the web** — *"so the two can never quote
different numbers for the same person."* Changing it in the widget instead is
how the phone and the web start disagreeing about what somebody owes.

Nothing on screen changes yet. It ships alone.

### 2. Check `AWAITING_REVIEW`

`FINDINGS.md` §3. If a document already with the office still appears in
`pending.toUpload`, the app is chasing people for something they have done.
One query on the server answers it.

### 3. The glyphs

`../icons/doc-glyphs.tsx` — move the whole `icons/` folder in, as its README
describes. `SignGlyph` and `DocumentsGlyph` are reused, not redrawn.

### 4. Restyle the row

Amazen tile, type and tones. `SPEC.md` §2–3. The shape does not change; the
existing rule that *the tone lives in the icon tile* is already correct.

### 5. The two second lines

`SPEC.md` §4. They render only in states ⑥ and ⑦ and nowhere else.

**Steps 1 and 2 are worth doing even if the widget never ships.** They are
bugs in a card that is on four home screens today.

---

## Rules that are not style

1. **One row. The line changes instead of multiplying.** Two second lines
   exist; there is no third.
2. **No dismiss button.** There is already a way to make it go away.
3. **Nothing when nothing is outstanding** — and that is the normal case.
4. **Tone does not follow the headline.** `blocksWork` makes the whole row
   `crit` whatever the title says.
5. **Expiry is only ever the headline when nothing else is outstanding.**
6. **One kind: name them. Both kinds: count them.**
7. **The summary rule lives in `packages/shared`.** The web reads it too.
8. **A member always sees what is required of them**, even for a type
   restricted to other roles.

---

## How to check it worked

- Reject a member's document with a note. The row should say **sent back** and
  quote the note — not "1 document needed".
- Send a member a document to countersign for somebody else. The row should
  **name that person**.
- Give a member one blocking requirement and three expiring certificates. The
  row is `crit` and talks about the blocking one; expiry is not mentioned.
- Supply everything. The card **disappears** and the home screen is unchanged.
- Turn off the network. The row still renders from the last answer, with no
  freshness line — an obligation does not expire with the cache.
- Restrict a document type to another role and require it of this member
  anyway. **They must still see it.**
- Compare the phone and the web for the same person. The two counts must
  match, because they came from the same function.
