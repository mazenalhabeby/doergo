# The icon system

Fifty-five marks drawn for the eight home-screen widgets, in one folder because
they are one family and a family kept in six places drifts.

```
shift-glyphs.tsx    6   the shift clock, and the two issue sheets
work-glyphs.tsx     8   the active row — the job you are on
route-glyphs.tsx    5   the driving day
crew-glyphs.tsx     5   attendance
queue-glyphs.tsx    5   what is waiting on you
tile-glyphs.tsx    16   the shortcuts rail, and every screen that had no mark
doc-glyphs.tsx      5   the documents reminder — one sheet, four badges
crm-glyphs.tsx      5   the clients card
tab-glyphs.tsx      8   the footer — SEE THE EXCEPTION BELOW
index.ts                every export, grouped
```

**77 marks** in the app today, once `OnBreakGlyph` is dropped and the footer
is added.

Drawn at 350pt and at 12–150px: board **⑦ The icon system** at
https://claude.ai/artifact/9GcjYhxdrUEaL7NAVstB7U

---

## The law

The existing `apps/mobile/src/components/glyphs/glyphs.tsx` states it, and every
mark here obeys it:

> "ONE colour at four opacities — .2 for what sits behind, .3 for the body,
> .5 for detail, .95 for the thing that names it"

> "`contrast` is the colour PUNCHED out of a solid mark, and it must be the
> exact background the glyph sits on"

### Five rules that follow

**1 · Detail is cut out, never drawn on top.** A tick laid over a pin is a
smudge at 15px; a tick cut *through* it keeps the silhouette, and the
silhouette is the only thing legible at that size.

**2 · `contrast` is the SURFACE, not a colour choice.**

| Where the mark sits | `contrast` is |
|---|---|
| inside a filled jade button | a lighter jade — `#1fc39c`, **not** the card |
| on a neutral disc or tile | the tile's composited colour over the card |
| on a well | the well |

⚠️ A wrong value does not error. It draws a grey ghost across the shape.

**3 · Three elements is the ceiling.** One solid form plus one or two punched
details. Every mark that failed in this project failed by adding a fourth.

**4 · Marks that appear in one list differ in OUTLINE.** Four rectangles with
different rules inside them are one rectangle at 26px. `LeaveQueueGlyph`,
`ExpenseQueueGlyph`, `ProposalQueueGlyph` and `JoinQueueGlyph` stack vertically
in the same card, so they are a calendar, a torn strip, a tray and a figure.

⚠️ The converse holds and `doc-glyphs.tsx` relies on it: marks that are never
seen together **should** share a silhouette. Its four badges sit on one
identical sheet, because the row shows exactly one of them and they are the
same object in four conditions.

**5 · One mark, one claim.** `AddClientGlyph` is one card with a plus.
`ClientsGlyph` is the book of them. `JoinQueueGlyph` is a person asking to
join. Three plus-shaped ideas, three marks, never swapped.

### And one that is not about drawing

**The verb is data; the mark is not.** Button labels come from
`FlowStatus.label` and are organization-authored, so a workflow that calls it
"Roll out" still gets `OnMyWayGlyph`. **Map marks to the transition, never to
the wording.**

---

## ⚠️ The footer is the ONE exception to the law

`tab-glyphs.tsx` holds eight marks and every one of them is a **stroked
outline**. Nothing else in this family is. That is deliberate, and it is the
only exception — a ninth mark added to the footer follows the strokes, a ninth
mark added anywhere else follows the law.

Three reasons, and all three have to hold before a second style is worth
having:

**1 · They are drawn at 21px**, the smallest anywhere in the app. Four stacked
opacities at that size composite to a grey smudge; a single-weight outline
keeps its silhouette.

**2 · There is no surface to punch against.** Rule 2 says `contrast` is the
SURFACE, not a colour choice — and the footer's marks sit on a translucent
pill over a gradient that differs per screen. There is no one right value.

**3 · Navigation marks are not content.** The family's job is to tell one
OBJECT from another — a van, a payslip, a rest — in a list where several
appear together. These are always the same five, always in the same order, and
are recognised by position long before shape.

⚠️ **`TabMoreGlyph` is filled**, the exception inside the exception: an
outlined 2px dot is a ring with nothing in it.

⚠️ **`TabMessagesGlyph` is NOT `MessagesGlyph`**, and this is the one place the
"keep theirs" verdict below is overruled. Theirs is two bubbles with the near
one solid, drawn for a 44pt tile; at 21px the near bubble swallows the far one
and it becomes a blob. Same idea, different size, different drawing — which is
the only case where two marks for one thing is correct.

⚠️ **`TAB_GLYPHS` is the one map**, read by the pill AND by the overflow
sheet. The sheet was on Ionicons for a while after the pill moved, so Time off
was a calendar in two different drawings depending on which door you came
through.

---

## ⚠️ Five already exist in `glyphs.tsx`

Checked before drawing. In every case the existing one is right.

| Existing | Verdict |
|---|---|
| `MessagesGlyph` | **Keep theirs.** *"Two bubbles, the near one solid — a conversation, not one speech mark."* |
| `SendDocumentGlyph` | **Keep theirs.** *"ONE sheet with a rising badge — same construction as Documents, no confusing them."* |
| `BreakGlyph` | ⚠️ **OVERRULED — theirs was deleted.** This verdict and `index.ts` contradicted each other: the table said keep the cup in `glyphs.tsx`, the index exported `BreakGlyph` from `shift-glyphs.tsx`, and that one is a PAUSE — two bars punched through a disc. The pause won, on `shift-glyphs.tsx`'s own argument: *"a cup of coffee says lunch, not 'the clock has stopped counting'."* A rest is the clock stopping. |
| `SupportGlyph` | **Keep theirs.** *"A life ring: rescue, not a question mark."* |
| `EquipmentGlyph` | **Keep both.** Theirs is equipment as a category; `MyEquipmentGlyph` is the box that is yours. Two claims. |

### One duplicate to delete on the way in

`crew-glyphs.tsx` exports **`OnBreakGlyph`**, which is `BreakGlyph` drawn a
second time. Drop it and use the existing one. A family with two marks for one
thing is not a family.

Also reused unchanged, never redrawn here: `DocumentsGlyph`, `OpenJobsGlyph`,
`ApproveGlyph`, `BlockedGlyph`, `UrgentGlyph`, `PendingGlyph`,
`CompletedGlyph`, `ActivityGlyph`, `TodayGlyph`, `WeekGlyph`, `NetWorkGlyph`.

---

## Three that took more than one attempt

Written down because the same mistakes are easy to make again.

**`MyEquipmentGlyph`** — two failed drafts before the toolbox.

> A ghost case at .20 behind a body, a handle and a punched tag: four elements
> at four depths in one 24px square. The ghost broke the silhouette and the
> punched rectangle read as a **window**, not a label.

> An asset tag alone: clean, survived 12px, and read as a **price** tag. A
> price tag in a work app is wrong before anybody has thought about it.

The lesson is rule 3 plus one more: **the object has to be one the reader
already has a word for.** Designing the *concept* of custody produced two marks
nobody recognised; drawing a toolbox produced one everybody does.

**`OnMyWayGlyph`** — the van. The arches are **bitten out** of the body before
the wheels are set in them, or the wheels are swallowed by the panel. And an
earlier closing arc landed below its start Y, sloping the bottom edge.

**`StopDoneGlyph`** — `ArrivedGlyph` with the check **punched through** the
head rather than drawn on it. Drawn on top it reads as a smudge at 15px.

---

## Moving it in

1. Move this folder into `apps/mobile/src/components/glyphs/`.
   ⚠️ **`glyphs/`, not `home/`** — the marks are not the home screen's. The
   footer reads `tab-glyphs.tsx` and the tile rail serves three surfaces;
   `components/home/` held four dead screens and 72 require cycles until they
   were deleted. A family kept beside one consumer gets copied by the next.
2. Fold `index.ts` into that folder's existing one.
3. Delete `OnBreakGlyph` and point its callers at `BreakGlyph`.

**No edits to any `.tsx` are needed.** Each file's
`import type { GlyphProps } from './glyphs'` is already written for the
destination — which is exactly why none of them compile here.

Every file typechecks clean against `apps/mobile/tsconfig.json` with
`GlyphProps` stubbed.

---

## Where each widget's marks are used

| Widget | Folder | Marks |
|---|---|---|
| Shift clock | `../shift-clock/` | `shift-glyphs.tsx` |
| My work | `../my-work/` | `work-glyphs.tsx` |
| Today's route | `../my-route/` | `route-glyphs.tsx` |
| Crew | `../crew/` | `crew-glyphs.tsx` |
| Needs you | `../needs-you/` | `queue-glyphs.tsx` |
| Shortcuts | `../shortcuts/` | `tile-glyphs.tsx` |
| Documents needing you | `../documents-due/` | `doc-glyphs.tsx` |
| Clients | `../clients/` | `crm-glyphs.tsx` |
| **The footer** | *(no folder — no spec was written)* | `tab-glyphs.tsx` |
