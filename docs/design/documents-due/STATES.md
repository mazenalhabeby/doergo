# States

Eight. The eighth is the normal one.

| # | State | Tone | Second line |
|---|---|---|---|
| ① | Blocking | `crit` | — |
| ② | To supply | `warn` | — |
| ③ | Expiring | `accent` | — |
| ④ | To sign | `warn` | — |
| ⑤ | Both kinds | `warn` | — |
| ⑥ | **Sent back** | `crit` | the reviewer's note |
| ⑦ | **Somebody else's** | `warn` | who is waiting |
| ⑧ | Nothing outstanding | — | **not drawn** |

---

## ① Blocking

`blocksWork` on any single requirement.

> **Driving licence needed**
> This is stopping work being assigned to you

The subtitle says **what it costs**, not what it is. The member can read the
title; what they cannot see from the title is that jobs are not reaching them
because of it.

---

## ② To supply · ③ Expiring · ④ To sign

Named, not counted — *"a bare count makes somebody open the screen just to find
out which."*

③ is the only one in `accent`. A certificate running out in three weeks is
information, and:

> "dressing it as an alarm is what makes people stop believing the alarms"

---

## ⑤ Both kinds

Counts, not names: *"2 to supply · 1 to sign"*. Six names do not fit a two-line
space, and the screen behind the row has them all.

---

## ⑥ Sent back — new

The only state where the member has **already acted** and does not know it
failed. The reviewer's note is the second line, quoted, because without it they
repeat the mistake.

Ranks above ② — a rejected document is more urgent than an absent one.

⚠️ Does not exist yet: `REJECTED` is not an input to `summarisePending()`.
`FINDINGS.md` §1.

---

## ⑦ Somebody else's — new

`toSign[].forMember` is non-null. Name the person.

> **Sign Anna Müller's time sheet**
> Waiting on you since Friday

⚠️ Somebody is **blocked on you**. That is not the same errand as signing your
own contract, and it should not share a sentence with it.

`FINDINGS.md` §2.

---

## ⑧ Nothing outstanding

**The card is not drawn.** From the component:

> "It renders nothing when there is nothing outstanding, which is the normal
> case, so the home screen is unchanged for everybody who is up to date."

⚠️ And there is **no dismiss button**, on purpose:

> "Dismissing either hides a real obligation or teaches people that the
> reminder is optional, and there is already a way to make it go away — supply
> the document."

Per §2.4 rule 2 the stored key stays in the layout. Hidden is not removed.

---

## Offline

Kept — see `SPEC.md` §7. The row renders from the last answer and says nothing
about freshness, because an obligation does not expire with the cache.

---

## Failure

§2.4 rule 3: the widget fails alone. A failed request renders ⑧ — nothing —
rather than an error. A reminder that shows an error is worse than a reminder
that is quiet: it trains people to ignore the space.
