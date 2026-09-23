# Open questions

Two things I could not settle from the code, and neither should be decided by
whoever picks this up in a hurry.

---

## 1. Done is one tap from a mis-tap

The row carries a jade act disc and a grey Done tick, 34pt apart. Ticking Done
**removes the row and drops the count**, and the underlying write
(`customer.activityUpdate`) queues immediately.

On a phone in a van, a thumb catches the wrong disc. The reminder is gone and
nothing says so.

### Three ways out

| | |
|---|---|
| **An undo snackbar** | 30 seconds, then it commits. **The app already does this** — the attendance approvals flow batches with a 30-second undo. |
| **Long-press to tick** | No extra UI, but undiscoverable, and it fights every other disc on the home screen. |
| **No Done on the card** | The row opens `/customer/[id]` and the tick lives there. Safest, and it costs the card the thing that makes it different. |

**My recommendation: the undo.** It matches a pattern already in the app, and
the offline lane makes it cheap — the op is enqueued either way; undo removes
it before it settles.

⚠️ Whatever is chosen, it must be decided **before** build. Retrofitting undo
onto a queued write is harder than it looks.

---

## 2. "Going cold" has no definition anywhere

I drew **30 days**. There is no such threshold in the codebase — I picked a
number that sounded right, which is not a reason.

### Two ways out

| | |
|---|---|
| **A constant in `packages/shared`** | `CRM_COLD_AFTER_DAYS = 30`. One place, the web and the phone agree, and it is visible to anybody reading the code. Nobody can tune it. |
| **An organization setting** | Correct for a business selling annual service contracts and one selling coffee. But it is another thing to configure, and most never will — so it needs a sane default anyway, which is the constant. |

**My recommendation: the constant now, the setting when somebody asks.** And
in both cases:

⚠️ **The card prints the number.** *"4 going cold — no contact in 30 days"*,
never *"4 going cold"* alone. A threshold the reader cannot see is a judgement
they cannot argue with.

---

## 3. A smaller one: what does the number count?

The headline counts **reminders**, and one client can carry two — ring them
*and* email the quote. So a book with three reminders across two clients reads
`3 need you` and shows two monograms.

Counting **clients** reads better in the sentence and matches the rows, until
one client has two reminders and one of them has to be hidden or merged.

I kept reminders, because the card's promise is *"these are the things waiting
on you"* and two things on one client are still two things. But it is worth a
minute of somebody else's judgement.
