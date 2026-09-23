# Spec — Shortcuts

§3.27 `quick-actions`, absorbing the three catalogue rows that are really a
badge and a destination: **§3.22 `messages`**, **§3.17 `credentials`**,
**§3.23 `sync`**. The catalogue goes **18 → 15**.

Visual reference: board **⑥ Shortcuts — the widgets that are really buttons**
at https://claude.ai/artifact/9GcjYhxdrUEaL7NAVstB7U

**Read `DESTINATIONS.md` first.** The rail is a view of a table.

---

## 1. Why those three fold

| | Renders (§) | What it adds over a tile |
|---|---|---|
| §3.22 messages | *"Unread count, the last two senders"* | two names you will read again in the thread |
| §3.17 credentials | *"Count by urgency, the three nearest"* | three names you cannot act on from here |
| §3.23 sync | *"Waiting · needs attention · last synced"* | a state you either act on or ignore |

None of them changes **what you do** based on its detail. You look at the
number, and either you go or you don't. That is a button.

§3.27 already says *"Up to four tiles — only the ones the viewer can actually
use"*, and a badged doorway is the same object as a verb: **one tap to
somewhere, carrying its own gate.**

---

## 2. Anatomy

```
┌─ well, radius 26 ─────────────────────────┐
│  ┌────┐³  ┌────┐²  ┌────┐   ┌────┐        │
│  │ ▣  │   │ ▤  │   │ +  │   │ ⌗  │        │  71pt tiles, 9pt gaps
│  └────┘   └────┘   └────┘   └────┘        │
│  Messages Credentials New job  Scan card   │
└───────────────────────────────────────────┘
```

**The tile — three parts**

| | |
|---|---|
| **the mark** | the house glyph at 26px on a 71px tile |
| **the label** | one or two words. *"Send doc"*, not *"Send a document"* |
| **the badge** | only when something is waiting. `crit` for people, `warn` for things |

Four across a 350pt card at 71pt each. **No fifth, and no scroll.** §3.27 says
up to four, and a toolbar you have to swipe is a menu.

⚠️ The tile is a real `<Pressable>` with an `accessibilityLabel` that includes
the count — *"Messages, 3 unread"*. The badge is not decoration; it is half the
label.

---

## 3. Which four survive

Twenty-two destinations, four slots. §3.27 says *"up to four"* and stops; this
is the missing half.

1. **Drop every tile the viewer cannot use.** Each carries its own gate — see
   `ACCESS.md`. This is usually most of them.
2. **Badged tiles first, by badge age.** Something is waiting. A doorway with a
   number beats an empty verb.
3. **Then the create actions, in registry order.** Stable — a toolbar that
   reorders itself is a toolbar you cannot learn.
4. **Cut to four. Fewer than two, hide the card.**

⚠️ **Only step 2 moves during the day.** Badges come and go, so the last two
slots are stable and the first two are live — which is the right way round for
muscle memory: the thing you reach for without looking never moves.

---

## 4. The badge

Counts come from the sources named in `DESTINATIONS.md`. Two rules:

⚠️ **A badge is a count, never a dot.** *"Something is waiting"* without a
number is a thing to check; **3** is a thing to plan around.

⚠️ **A badge caps at 9+.** Two characters is the tile's whole budget, and past
nine the exact number stops changing the decision.

**Tone**

| | |
|---|---|
| `crit` | a person is waiting — messages, join requests, not arrived |
| `warn` | a thing is waiting — documents, sync queue, credentials |

That distinction is the only colour decision in the widget and it is worth
keeping: a red badge on Sync would put a queued photo upload on the same
footing as somebody who has not turned up.

---

## 5. Data

**The rail itself makes no request.** It renders from `destinationsFor(user)`,
which is a filter over a local table.

**Badges are counts other widgets already fetch.** Wherever a count is already
on screen for another reason, the tile reads it from the same place rather than
asking again:

| Badge | Already fetched by |
|---|---|
| not arrived | `crew` |
| pending leave / join requests | `needs-you` |
| documents due | `documents-due`, if built |
| sync queue | local outbox — no request ever |

⚠️ A badge must never be the **only** reason a request happens. If nothing else
on the home screen wants that count, the tile renders without a badge rather
than firing a call to decorate itself.

---

## 6. States

`STATES.md`. Five, and the ones that matter:

- **Nothing waiting** — four verbs, no numbers. The card is a toolbar.
- **Two tiles** — still a card.
- **One tile — not drawn.** *One tile is a button that has learned to look like
  a widget; it belongs on the screen it opens.*

---

## 7. Copy

Labels are i18n keys from the table, not strings in the widget. Length budget
is **two words, ~11 characters** at 10.5pt.

| | |
|---|---|
| Messages | `shortcuts.messages` |
| Credentials | `shortcuts.credentials` |
| Sync | `shortcuts.sync` |
| Documents | `shortcuts.documents` |
| My equipment | `shortcuts.myEquipment` |
| New job | `shortcuts.newJob` |
| Log expense | `shortcuts.logExpense` |
| Send doc | `shortcuts.sendDoc` |
| Scan card | `shortcuts.scanCard` |
| Add client | `shortcuts.addClient` |
| Sign | `shortcuts.sign` |
| Overtime | `shortcuts.overtime` |

⚠️ German and Dutch will not fit *"My equipment"* in two words. The label wraps
to two lines before it truncates, and the tile is sized for two lines from the
start — not stretched later when somebody notices.
