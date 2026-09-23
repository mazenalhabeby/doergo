# States

Six. The shape is decided by `SCALE.md`; this is what fills it.

| # | State | Condition | Rail |
|---|---|---|---|
| ① | Busy | any band non-empty | tiles + steady chip |
| ② | Calm | every band empty, somebody on | **no tiles** |
| ③ | Before the first shift | nobody clocked in, shifts scheduled | who is coming, and when |
| ④ | Nobody at all | no shifts today in scope | none |
| ⑤ | Offline | request failed, no cache | placeholders |
| ⑥ | No roster | `rostered.size === 0` | unchanged, hero loses its `/n` |

---

## ① Busy

Tiles for everyone in a band, ordered **late → free soon → over → break over**,
then the steady chip. Exception rows beneath, one per non-empty kind.

The `⋯` menu holds the scope switch when there is more than one workspace.

---

## ② Calm

Every band empty. **No tiles at all** — just the hero, the faces at 28pt, and
one line:

> Everyone is in. Nothing waiting.

⚠️ This is the state to get right. Most manager dashboards keep the alarm
furniture on screen permanently, greyed out, so calm looks identical to broken.
**A good morning should look like one**, and the card getting visibly shorter
is how it says so.

---

## ③ Before the first shift

Nobody is on yet, but shifts exist. The rail turns around and shows **who is
coming**: the same tile, `off` state, figure = time until start, span =
`STARTS 07:00`.

> Nobody is on shift right now.

§3.6 calls that "a true and useful statement". It is, and it earns one more
line: who is first, when, and where.

---

## ④ Nobody at all

No shifts scheduled in scope today — a Sunday, a closed site.

Hero `0`, no `/n` (there is no roster to be a fraction of today), no rail, one
line. ⚠️ Per §2.4 rule 2, **do not remove the widget from the layout**. A quiet
Sunday is not a reason to lose the card on Monday.

---

## ⑤ Offline

**Presence is not kept.** §3.6: *stale is wrong, not old.*

- hero → `—`
- tiles → three empty placeholder shapes, so the card keeps its height and
  does not jump when the answer arrives
- one line: *Needs a connection. A kept answer would be wrong, not old.*

⚠️ No "last updated 09:12" line. That invites the reader to treat the old
number as approximately true, which is the exact failure this state exists to
prevent.

Per §2.4 rule 3 this widget fails alone. A throw renders ⑤ and never
propagates — `apps/mobile/src/offline/tasks/list-failure.ts` is the model, and
three of its four branches are non-fatal.

---

## ⑥ No roster — a modifier, not a branch

`FINDINGS.md` §1. When `rostered.size === 0` the shipped code makes the
denominator equal the numerator, so **the bar is always full and nobody is ever
missing**.

The fix is in the hero, and it applies on top of ① – ④:

| | |
|---|---|
| Roster in scope | `6/9` · `on the clock` |
| **No roster** | `6` · `on the clock right now` |

Drop the `/n`. A number with no denominator is honest; a denominator that is a
copy of the numerator is not.

⚠️ Everything else still works — the bands, the tiles, the exceptions all come
from the entries themselves, not from the roster.

---

## The per-tile ring, across states

| | Ring |
|---|---|
| On the clock | jade arc, `clockInAt → expectedClockOutAt` |
| Free soon | jade arc, nearly closed |
| Past the end | full jade, warn tail sweeping past the top (`reminderState`) |
| On a break | dashed warn arc — the shift clock is still running underneath |
| Late | dashed crit ring, **no arc** |
| Not in | no ring |
| **`expectedClockOutAt == null`** | **plain jade ring — present, no progress** |
| **`endIsDailyLimit === true`** | **plain jade ring — see `FINDINGS.md` §3** |

The last two are the honest-ring rule. A cut-off is not a finish, and an arc at
90% against a daily cap reads "nearly done" when it means "nearly at the
limit".
