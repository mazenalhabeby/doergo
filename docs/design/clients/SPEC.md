# Spec — Clients

Widget §3.11 `crm-today`. One registry row, no folds.

**Read `ENDPOINT.md` first.** This card cannot be built without it.

Visual reference: board **⑩ Clients — owed, going cold, and the book** at
https://claude.ai/artifact/9GcjYhxdrUEaL7NAVstB7U

---

## 1. Three parts, in this order

```
┌─ glass, radius 28 ────────────────────────────┐
│  CLIENTS                                      │
│                                               │
│  5                                            │  ← what is owed
│  need you                                     │
│  2 CALLS · 1 EMAIL · 2 OTHER                  │
│                                               │
│  [SA] Ring Siemens AG           4d  (☎)(✓)    │
│       Reminder · call · quote sent 11 Sep     │
│  [MK] Ring Müller KG            1d  (☎)(✓)    │
│  [RW] Email REWE Wien        14:00  (✉)(✓)    │
│  ───────────────────────────────────────────  │
│  [❄] 4 going cold — no contact in 30 days  ›  │  ← what is drifting
│  ───────────────────────────────────────────  │
│  All 214 clients                           ›  │  ← the book
└───────────────────────────────────────────────┘
```

**Glass** — the third and last in the catalogue, with the shift clock and the
crew. It is the only widget carrying live actions, which is what earns it.

---

## 2. The headline is read from the data, never assumed

`REMINDER_KINDS = ['CALL', 'EMAIL', 'OTHER']`. *"Owed a call"* is wrong the
moment one of them is an email.

| Kinds present | Headline | Sub-line |
|---|---|---|
| all `CALL` | **3** owed a call | `2 OVERDUE · 1 TODAY` |
| all `EMAIL` | **2** owed an email | `BOTH TODAY` |
| all `OTHER` | **2** need you | `2 OTHER` |
| mixed | **5** need you | `2 CALLS · 1 EMAIL · 2 OTHER` |
| none | Nobody is waiting on you. | — |

⚠️ **The sub-line always carries the split**, even when the headline names a
kind — *"3 owed a call"* still has to say how many are late.

**This is `summarisePending()` again.** The documents reminder already solved
*one line, several kinds*: one kind — name it; several — count them. Put this
rule beside it in `packages/shared` and the web gets it free.

---

## 3. The row

```
[monogram]  VERB                          age  (act)(done)
            Reminder · kind · reason
```

**The verb leads.** *Ring Siemens AG*, not *Siemens AG · 4 days*. From
`packages/shared/src/crm/reminder.ts`:

> "`reminderKind: 'CALL'` is an INTENT — remind me to call them on Tuesday. A
> `CustomerActivity` of type `CALL` is a RECORD — I called them. Same word,
> opposite direction in time."

> "a reminder row must always render its reason."

⚠️ So the second line is literally `Reminder · call · <body>`. The word
"Reminder" is not filler — it is the thing that stops the row being read as a
call that already happened.

⚠️ **The reason is text, never an icon.** A glyph cannot say which direction in
time it points. A word can.

**The monogram** carries a 16pt badge: `ClientCompanyGlyph` or
`ClientPersonGlyph` from `type`. Absent reads as PERSON — *"the column's own
default."*

---

## 4. The two discs

| | |
|---|---|
| **jade** | the act. `tel:` for CALL (`CallGlyph`), `mailto:` for EMAIL (`EmailGlyph`) |
| **grey** | Done. `updateActivity(id, activityId, { done: true })` (`FinishGlyph`) |

Both already exist — `CallGlyph` and `FinishGlyph` are in `work-glyphs.tsx` and
are not redrawn.

⚠️ **Two discs is the ceiling.** A third — snooze, reassign, log a note — turns
a reminder into a form, and `/customer/[id]` already is one.

⚠️ **Done needs an undo.** See `OPEN.md` §1. It is the only place this card can
lose something.

---

## 5. `OTHER` changes the row, not just the word

`reminderKind: 'OTHER'` has no verb of its own, so:

- **the note becomes the title** — *"Check the permit before Friday"*
- **the client drops to the second line** — `Reminder · Müller KG`
- there is no `tel:` or `mailto:`, so it is **one disc, not two**: Done, then
  the chevron

The leading mark is `ReminderGlyph` in a tinted tile, never in a jade disc —
there is no act to offer.

---

## 6. The All row

`All 214 clients ›` is on **every** state. Empty, full, shared, `OTHER`,
offline — always.

- The book is the reason the module was bought. A card that only appears on the
  days somebody is late hides it most of the time.
- It is the one part that does not depend on data arriving.
- And it is what makes the card safe to keep small: everything the three
  sections cannot hold is one tap away, by the same door, every time.

⚠️ The count rides in the same response. If it has not arrived the row still
renders — **`All clients ›`**, without a number. *A door that waits for a
number is not a door.*

---

## 7. Offline

**The reads are not kept.** `/crm/due` is a *now* question like presence: a
stale "owed a call" list sends somebody to ring a client who was rung this
morning.

**The writes are already queued.** From
`apps/mobile/src/offline/crm/client-actions.ts`:

> "EVERYTHING ABOUT ONE CLIENT TRAVELS IN ONE LANE, `crm:<customerId>`. Order
> within a lane is kept, so a stage tapped, an edit saved and a reminder ticked
> in a basement reach the server in the order they were made."

`customer.activityUpdate` is the Done tick and is **already an outbox op**. So
the tick never shows a spinner, and `client-overlay.ts` says why that is sound:

> "A queued change is not optimistic state living in a component — it is a
> fact."

⚠️ Offline the card renders the last answer with the discs **live** (the tick
queues) and a line saying the list may have moved. The All row works as ever.

---

## 8. Copy

| | |
|---|---|
| Headline, one kind | `{n} owed a call` · `{n} owed an email` |
| Headline, mixed/other | `{n} need you` |
| Sub-line | `{n} CALLS · {n} EMAIL · {n} OTHER` |
| Empty | `Nobody is waiting on you.` (§3.11's own string) |
| Cold | `{n} going cold — no contact in {days} days` |
| Shared | `any of {n} managers` |
| The book | `All {n} clients` · `All clients` when the count is missing |
