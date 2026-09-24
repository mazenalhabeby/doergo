# What to say to an implementer

Paste one of these. Nothing in them depends on seeing the canvas.

---

## A · Starting from nothing

```
You are working in the doergo monorepo. There is a complete design handoff in
docs/design/ — eight widgets for the mobile home screen, specified against the
real code in this repository.

FIRST, read these two in full before you write anything:
  docs/design/README.md    the map: what exists, the build order, the rules
  docs/design/BOARDS.md    why board titles mean nothing to you, and what does

Then tell me what you understand the state to be, and what you intend to do
first. Do not start until I answer.

Three things about how these documents are written:

1. Every ⚠️ line is a bug that has already happened in this codebase, usually
   with the incident quoted from the code's own comments. Treat each one as a
   requirement, not advice.

2. Each widget's states are a CLOSED LIST in its STATES.md. If the thing you
   are building has a condition that is not in that list, stop and ask — do not
   invent a ninth state.

3. Where a file says a rule belongs in packages/shared, put it there. Several
   of these rules are read by the web app too, and the documents say which.

Do not modify anything under apps/ or packages/ until I have answered.
```

---

## B · Building one widget

Swap the paths. This example is the shift clock.

```
Read these in full, in this order:
  docs/design/README.md
  docs/design/shift-clock/README.md
  docs/design/shift-clock/FINDINGS.md
  docs/design/shift-clock/TOKENS.md
  docs/design/shift-clock/SPEC.md
  docs/design/shift-clock/ISSUES.md

Then build, in this order, one commit each:

  1. TOKENS.md §2  — add the `warn` token to the palette
  2. TOKENS.md §3  — fix the two contrast bugs. Both are live accessibility
                     failures; §3 gives the measured values and the fix.
  3. SPEC.md §1–2  — the card and all eight states
  4. SPEC.md §3    — FIXED / FLEXIBLE / NONE, the three kinds of worker
  5. SPEC.md §4    — the discs
  6. ISSUES.md §2–5 — the report form, the sent state, the list, the thread

The marks are already written and typechecked:
  apps/mobile/src/components/home/shift-glyphs.tsx

Rules for this work:
  · Follow every ⚠️ line literally.
  · SPEC.md §2 is the complete set of states. Do not add one.
  · Copy comes from the copy tables. Do not rewrite a string because it reads
    oddly — several of them are quoted from the app's own i18n.
  · If a spec and the current code disagree, say so before changing either.

When each step is done, run through that file's "How to check it worked" list
in the folder's README.md and tell me the result of each line.
```

---

## C · The six bugs, with no widget work at all

```
Read docs/design/README.md §2 — six defects in code that ships today, each
with the file and symbol.

Fix them as six separate commits, in this order:

  1. getActiveEntries has no `take` on an org-wide route
  2. `if (rostered.size === 0)` makes "6 of 9" read "6 of 6"
  3. supportsMultiStop() is exported and never called
  4. summarisePending() drops REJECTED and forMember
  5. canAssignTasks is passed to getStatusCounts and never destructured
  6. white on accent-lift #14a586 measures 3.11:1 in light mode

The full write-up for each is named in §2. Read it before touching the file —
each one explains what the bug costs a real member, and two of them have a
comment in the code arguing for the current behaviour that you need to
understand before you change it.

Add a regression test for 1, 3, 4 and 5. Do not change behaviour beyond what
each write-up describes.
```

---

## D · When it produces the wrong thing

```
Stop. You built X; the specification is at <path> §<n>.

Quote the lines you were working from, and tell me which of these happened:
  · the file does not say what I think it says
  · the file says it but is ambiguous
  · you did not read that file
  · you read it and chose differently — say why

Then re-read <path> in full and do only §<n>.
```

---

## What NOT to say

❌ *"Build ① Shift clock — the marks"* — a canvas board title. It appears
nowhere in this repository. See `BOARDS.md`.

❌ *"Make it look like the design"* — the design is 8,000 lines of text, not a
picture. Name the file.

❌ *"Build the Jobs screen"* — there is no specification for any screen yet,
only for the eight widgets. `BOARDS.md` lists which boards have files and which
do not.
