# `shift-clock` — the card, every state

> Implements §3.1 of `docs/home-widgets.md`, plus three states that fall out of
> the data and one the spec does not assign to anybody.
>
> Component: `apps/mobile/src/components/home/shift-clock-card.tsx`

---

## 1. The shape, once

One **glass** surface — `surface-glass` with `line-glass` and `shadow-glass`,
`radius-surface` 30px, `space-5` padding. The same card in every state below.
Only the eyebrow, the figure and the discs change.

That matters more than it sounds. Today clocked-out is a quiet navigation row
with a chevron and clocked-in is a saturated block; they share nothing, so the
card is re-read from scratch every time it flips.

```
┌──────────────────────────────────────┐
│ ● ON THE CLOCK                       │   eyebrow, 12/16, letter-spacing 2.4
│                                      │
│ 3h 12m                               │   display 64/66 w300, unit at 29
│ HBC Office · counted 2h 48m ·        │   caption 12/16, ink-onglass
│ rest due 11:00                       │
│                                      │
│  ◉      ○      ○      ○              │   58px discs, exactly one filled
│ Clock  Break  Report  My             │   12/16 labels, always present
│  out                 issues          │
└──────────────────────────────────────┘
```

### The hero is set like an amount

Integer at `display`, unit at `decimal` — the rule the design system already
uses for money, because it solves the same problem: a big number with a small
qualifier after it.

```
3 h   12 m        not   3h 12m at one size
```

### ⚠️ Never the word "paid"

Two clocks exist. `clockInAt`/`clockOutAt` are evidence;
`countedStartAt`/`countedEndAt`/`paidMinutes` are what payroll reads. Only the
counted figure belongs here, and it is called **counted**. Say *counted*,
*worked*, *approved* — never *paid* or *unpaid*.

---

## 2. The states

Data comes from `src/offline/attendance/use-shift.ts` — **never** the response
cache. `/attendance/status` and `/attendance/breaks/status` are in the `NEVER`
list in `response-cache.ts` on purpose: a kept answer would reply first, older,
and pretend to be fresh, on the one card where that costs somebody a shift.

### ① Clocked out, before the shift

| | |
|---|---|
| **Eyebrow** | `NOT ON THE CLOCK`, dot in `line-field` |
| **Hero** | the rostered start — `07:00` — in `ink` |
| **Caption** | `HBC Office · your shift starts in 12 minutes` |
| **Discs** | Clock in (filled) · Report · My issues |

The hero is the *next* thing, not a zero. A 72pt `0` is what the old dashboard
did with `0/12`, and it is the same mistake at a smaller scale.

### ② Clocked in

| | |
|---|---|
| **Eyebrow** | `ON THE CLOCK`, jade dot with a 4px halo |
| **Hero** | elapsed since `clockInAt`, recomputed every minute |
| **Caption** | `{workspace} · counted {n} · rest due {time}` |
| **Discs** | Clock out (filled) · Break · Report · My issues |

⚠️ Derive elapsed from `clockInAt`, never count up from mount. A phone that
slept through lunch must show the right number the instant it wakes.

The dot breathes only while somebody is actually working — a pulse that never
stops is decoration.

### ③ On a rest

| | |
|---|---|
| **Eyebrow** | `ON A REST` in `warn` |
| **Hero** | rest elapsed, in `warn` |
| **Caption** | `Back at 11:24 · counted 2h 48m, not counting now` |
| **Discs** | End the rest (filled) · Clock out · Report · My issues |

The counted figure freezes and **the card says it has frozen**. A rest that
silently keeps counting is the bug that sentence prevents.

### ④ Rest overdue — the primary action changes

| | |
|---|---|
| **Eyebrow** | `ON THE CLOCK` |
| **Hero** | elapsed |
| **Extra** | a `warn` strip: `Your rest was due 32 minutes ago` |
| **Discs** | **Start the rest** (filled) · Clock out · Report · My issues |

The only place in the catalogue where the filled disc is not the obvious one.
Clock out is still one tap away; it simply is not the thing being offered.

### ⑤ Queued — no signal

Same as ②, plus a `QUEUED` chip in the header row and a caption of
`{workspace} · waiting to reach the office`.

Fully works. The clock-in sits in the outbox and the card says so — it does not
pretend the office already knows.

### ⑥ Clocked out, finished today

| | |
|---|---|
| **Eyebrow** | `DONE FOR TODAY` |
| **Hero** | the day's counted total, in `ink` |
| **Caption** | `HBC Office · 06:45 → 15:00 · counted, waiting for approval` |
| **Discs** | Clock in again (**unfilled** — unusual) · Report · My issues |

A different state from ①, and §3.1's single line — "Not on the clock" — covers
both. The hero here is what they earned.

### ⑦ Shift left open — **not in §3.1**

Driven by `AttendanceStatus.unconfirmedClockOut`.

| | |
|---|---|
| **Eyebrow** | `NEEDS YOUR TIME` in `critical` |
| **Body** | `When did you leave?` at `h2` |
| **Caption** | `Yesterday at HBC Office. We closed it at 17:00 because it was left running.` |
| **Discs** | Set the real time (filled) |

No widget in `home-widgets.md` claims this field. Until one does, the shift
cannot be approved and nothing asks. **Decide whether it lands here or
somewhere else — do not leave it nowhere.**

### ⑧ Not rendered

A member with no workspace assignment has nothing to clock into. The widget
does not appear at all. Entitlement is asked before content, never after.

---

## 3. Three kinds of worker

`User.scheduleType` is `FIXED | FLEXIBLE | NONE`, default `NONE`.
**Neither it nor `monthlyHourBudget` is on the mobile `User` type today** — see
`FINDINGS.md` §3. Both need adding to the login/validateToken payload, beside
`allowRemote` and `orgAddOns`. No new endpoint.

The hero before clocking in is **whatever that person is measured against**:

| `scheduleType` | The question | Hero when clocked out | Progress when on the clock |
|---|---|---|---|
| `FIXED` | am I on time? | the rostered start `07:00` | today — `3h 12m of 8h` |
| `FLEXIBLE` | am I on track this month? | `84h` of `160h`, days left | the month — `87h of 160h` |
| `NONE` | nothing is promised | this week's total | **no bar at all** |

⚠️ `NONE` renders **no progress track**. A bar with no target invents one.

⚠️ Overtime means different things: past the rostered end for `FIXED`, past the
monthly budget for `FLEXIBLE`, nothing for `NONE`.

Once on the clock all three agree on the elapsed figure, because that part is
the same job.

`FLEXIBLE` needs a month-to-date total. `/attendance/history` can answer it,
but summing a month on the phone on every render is the wrong shape — ask for
it as a **count**, the way `pending-hours` does (page 1, limit 1, total from
the envelope).

---

## 4. The discs

`radius-full`, 58px, gap `space-4`. Exactly **one** is filled with the jade
gradient and carries `shadow-disc-primary` — its glow is what marks it primary,
not its size or its position. The rest are `surface-tile` with a hairline and
`shadow-disc`.

Every disc carries a label beneath it. Icons never carry meaning alone.

| Disc | Glyph | Goes to |
|---|---|---|
| Clock in / out | `ClockInGlyph` / `ClockOutGlyph` | the action, in place |
| Break | `BreakGlyph` | the action, in place |
| Report | `IssueNewGlyph` | the report sheet — `ISSUES.md` |
| My issues | `IssueMineGlyph` | the list sheet — `ISSUES.md` |

**My issues carries a badge only when somebody has replied to you** — an unread
count, never a total. Same number the list shows.

### What leaves the card

`Activity` and `My issues` are currently four equal buttons alongside Clock
Out. Activity is a different widget (it belongs to the `needs-action` row) and
does not return. My issues stays, as a disc.

§3.1 asks for elapsed, workspace, counted, next rest and **one** primary
action. Four equal full-width buttons is a menu, not a card.

---

## 5. Tapping the card

The card itself is **not** a target. Only its parts:

- the hero and caption → `/attendance`
- each disc → its own action or sheet
