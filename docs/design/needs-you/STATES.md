# States

Three, and the third is the one that needs stating.

| # | State | Condition |
|---|---|---|
| ① | Several queues | more than one held grant has items |
| ② | One queue | one held grant has items |
| ③ | **Not drawn** | every held queue is empty, or no grants are held |

---

## ① Several queues

One row per non-empty queue, **oldest item first**. The hero sums them and
names the oldest age anywhere in them.

At most four rows, so the card's height is bounded by the number of grants —
not by how much is waiting. A queue of two hundred expenses is one row.

---

## ② One queue

Identical, with one row. The header still reads `1 QUEUE`, which tells a
supervisor that this is all of it and not a truncation.

⚠️ **The other three are not shown as empty.** They are not this viewer's to
see, and the card says nothing about them at all — no greyed rows, no zeroes.
A zero is a claim about a queue you have been told nothing about.

---

## ③ Not drawn

All four sources say *hidden when empty* (§3.14 puts it as *"renders nothing at
all when the queue is empty"*), and folding them does not change that.

**An empty queue is the normal state.** A permanent "Nothing waiting on you"
row is furniture — it occupies the screen every day to tell you something you
would have noticed by its absence.

⚠️ Hidden is not removed. §2.4 rule 2: *"A stored key that is no longer allowed
is skipped silently — never an error, and **never deleted from storage**."* The
same applies to a key that is merely quiet today.

The board draws this state anyway, so the decision is on the record rather than
looking like an omission.

---

## Failure, per row

§2.4 rule 3: each widget fails alone. Inside this one, **each row fails alone
too**.

| | |
|---|---|
| One endpoint errors | that row is absent; the others render |
| All four error | the card is absent — state ③ |
| A grant is absent | no request is made at all |

The last line is the important one. A row you cannot see costs nothing —
neither a request nor a refusal.

---

## What does not exist here

**No loading skeleton for the whole card.** Rows arrive independently, so the
card grows as answers come back. A four-row skeleton that resolves to one row
is worse than one row appearing.

**No refresh control.** These are queues somebody else fills; pull-to-refresh
on the home screen already covers it.

**No actions.** Every verb lives on the screen behind the row, behind its own
grant — approving leave, accepting an expense, reviewing a proposal, admitting
a member. The card is a doorway, and that is why it could be folded at all.
