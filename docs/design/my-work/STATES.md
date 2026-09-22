# `my-work` — seven states, three of them empty

> Three of these cards have no rows in them and they are **not the same card**.
> `apps/mobile/src/offline/tasks/list-failure.ts` already draws the line; this
> is what the line looks like.

---

## The rule, already written

```ts
listFailureIsFatal(err, { shown, databaseStarting })
```

```
load() threw
 ├─ the server REFUSED — a 403, a 500            → FATAL      ⑥
 ├─ nothing answered, something already on screen → keep it   ③
 ├─ nothing answered, the database is opening     → keep going ①
 └─ nothing answered, nothing shown, none coming  → FATAL      ⑦
```

**Three of four branches are not fatal.** The rule exists because
`tasksApi.list()` was the one unguarded call on every home variant — an error
let out of it replaced the whole dashboard with a full-screen "You're offline",
throwing away the banner, the shift card and every panel already loaded beside
it.

---

## ① Opening

`isUnreachable(err)` · `databaseStarting`

Skeleton rows in the list; **the strip still draws**, because week shape comes
from data already in hand.

Not an error and not empty. A cold start reaches `load()` before the database
does — declaring somebody offline here is the error a Retry button then clears
on a phone with full signal.

## ② Loaded

Fresh from the server. No freshness label, because there is nothing to
disclose.

## ③ From this phone

`isUnreachable(err)` · `shown === true`

Real rows, plus a quiet `2h ago` chip in the header.

**The age is the disclosure, not a warning.** The OfflineBanner above already
carries the network; two messages about one fact read as a fault.

## ④ One row not yet known

`overlayTask()` · `pendingSync`

The status the member set, laid over the server's copy, with a `SENDING` mark
**on the row, not the card**. The rest of the list is the server's and is not
in doubt.

⚠️ Never written anywhere — computed on read — so a refused change disappears
from the screen the moment it is refused.

## ⑤ Empty — and true

The server answered and the answer was none.

> **Nothing scheduled today.**
> Your next job is Thursday at 08:00.

The second line comes free: the strip already knows which days have work.

**The only state allowed to say this sentence.**

## ⑥ Refused

`!isUnreachable(err)` — a 403, a 500.

> **Could not load your jobs.**
> The office refused the request.  · [ Try again ]

Fatal. Something is wrong the member cannot read past, and the error state is
the honest answer.

## ⑦ Nothing, and none coming

`isUnreachable(err)` · `!shown` · `!databaseStarting`

> **Your jobs are not on this phone yet.**
> Connect once and they will be here next time, signal or not.

---

## ⚠️ ⑤ and ⑦ are the whole point

They have the same empty list and mean opposite things.

**⑤ is a fact.** The server answered; there is nothing today.
**⑦ is an absence of information.** Nothing answered, and this phone has never
held a copy.

A member who reads *"Nothing scheduled today"* at 06:40 in a van **goes home**.

That is why `list-failure.ts` is a file rather than three inline conditions,
and why this widget may never collapse its empty states into one.

---

## The active row has its own states

It is a control, so it cannot be drawn from a copy the server has not seen.

| List state | The active row |
|---|---|
| ① opening | **not drawn** — a verb on a skeleton is a button that might be wrong |
| ② loaded | drawn, with the verb its status allows |
| ③ from this phone | drawn, and the verb still works — the transition queues |
| ④ one row queued | drawn; if it is *this* row, the verb reflects the status you set |
| ⑤ empty and true | nothing to act on |
| ⑥ refused | not drawn |
| ⑦ nothing at all | not drawn |

⚠️ In ③ the verb is **live**, not disabled. The whole app is offline-first;
the transition goes through the outbox and the row shows `SENDING`. A greyed
button on a phone with no signal is the app refusing work it is capable of.

---

## The strip has its own states

It is fed by data already in hand, so it survives things the list does not.

| List state | Strip |
|---|---|
| ① opening | draws, from whatever is cached |
| ③ from the phone | draws, same age as the list |
| ⑤ empty and true | **draws** — an empty week is information |
| ⑥ refused | draws if anything is cached, otherwise flat capsules |
| ⑦ nothing at all | flat capsules, no marks, still tappable |

⚠️ A flat strip is not an error state. Seven empty capsules say *no work this
week*, which in ⑦ would be a lie — so in ⑦ the **list** carries the sentence
and the strip stays silent rather than implying an answer.

---

## Never hidden

§3.2 is *"Who: Everyone."* Once the entitlement is corrected to
`hasModule('tasks') || hasModule('clock')` it is still never hidden for anybody
who has either — so unlike eleven of the other widgets, it cannot fall back to
disappearing.

**Every dead end has to be a designed sentence.** That is why this one needs
seven states where most need four.
