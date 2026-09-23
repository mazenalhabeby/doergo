# States

Seven. The All row is on all of them.

| # | State | Headline |
|---|---|---|
| ① | Mixed kinds | `{n} need you` |
| ② | All calls | `{n} owed a call` |
| ③ | All emails | `{n} owed an email` |
| ④ | All other | `{n} need you` |
| ⑤ | Shared reminder | as above, with one row marked |
| ⑥ | Nothing due | `Nobody is waiting on you.` |
| ⑦ | Offline | last answer, discs live |

---

## ① Mixed

The common case, and the reason the headline is computed. More than one kind is
waiting, so the line does not name one — the sub-line carries the split.

---

## ② ③ All one kind

The headline names it. `owed a call` · `owed an email`.

⚠️ The sub-line still splits by urgency, not by kind: `2 OVERDUE · 1 TODAY`.
Naming the kind twice is a waste of the only line the card has.

---

## ④ All other

`{n} need you`, because `OTHER` has no verb to name.

Every row is the `OTHER` shape — the note is the title, the client is the
second line, one disc. See `SPEC.md` §5.

---

## ⑤ Shared reminder

`reminderAssigneeId: null` means **every manager of this client** — the type
says so.

> **Ring Hofer & Bauer**
> Reminder · call · **any of 3 managers**

⚠️ Three people have this row on their home screen and **one call clears all
three.** The row must say so before somebody rings a client who was rung an
hour ago.

`managerCount` comes from the endpoint for exactly this line.

---

## ⑥ Nothing due

> Nobody is waiting on you.

§3.11's own string, and worth saying out loud once a day when there are 214
clients in the book.

⚠️ **The card still renders.** Going cold and the All row are both there — this
is the one widget whose empty state is not an absence, because the book is
always worth a door.

---

## ⑦ Offline

The last answer, with a line saying the list may have moved.

- The discs stay **live**. The tick queues through `crm:<customerId>`; `tel:`
  and `mailto:` need no network at all.
- The All row works exactly as ever.
- ⚠️ No freshness timestamp. A time on a stale reminder list invites somebody
  to treat it as roughly true, and this is the one list where "roughly true"
  means ringing a client twice.

---

## What is NOT a state

**Loading.** The card renders its shell — the header and the All row —
immediately, and the three sections fill in. A skeleton that resolves to
*"Nobody is waiting on you"* is worse than the sentence arriving late.

**Error.** §2.4 rule 3: the widget fails alone. A failed request renders ⑥'s
shape, and the All row still works. A client book is never unreachable, because
the door to it is a route.

---

## The cold tail, across states

It is a **row**, not a state — present under the reminders in ① – ⑥ whenever
`coldCount > 0`, and absent when it is zero.

⚠️ It prints its own threshold: *"no contact in 30 days"*, never a silent
judgement. The number itself is unsettled — see `OPEN.md` §2.
