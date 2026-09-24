# The shift clock — the card, the schedules, the issue flow

Everything needed to build clocking in and out. Self-contained: you do not need
any other file in this folder.

Marks are already written: `apps/mobile/src/components/glyphs/shift-glyphs.tsx`
Component: `apps/mobile/src/components/home/shift-clock-card.tsx`

---

## 1 · One shape, every state

One **glass** surface — `glass` + `glass_line` + `SH_GLASS`, radius 30, 20pt
padding. The same card in all eight states. Only the eyebrow, the figure and
the discs change.

```
┌──────────────────────────────────────┐
│ ● ON THE CLOCK                       │  eyebrow 12/16, tracking 2.4
│                                      │
│ 3h 12m                               │  hero 64/66 w300, unit at 29
│ HBC Office · counted 2h 48m ·        │  caption 12/16, ink-onglass
│ rest due 11:00                       │
│                                      │
│  ◉      ○      ○      ○              │  58pt discs, exactly ONE filled
│ Clock  Break  Report  My             │  labels 12/16, always present
│  out                 issues          │
└──────────────────────────────────────┘
```

⚠️ Today clocked-out is a quiet navigation row and clocked-in is a saturated
block. They share nothing, so the card is **re-read from scratch every time it
flips.** One shape fixes that.

**The hero is set like an amount** — integer at display size, unit at decimal.
`3 h 12 m`, not `3h 12m` at one size. Same rule the system uses for money.

⚠️ **Never the word "paid".** Two clocks exist: `clockInAt`/`clockOutAt` are
evidence, `countedStartAt`/`paidMinutes` are what payroll reads. Only the
counted figure belongs here. Say **counted**, **worked**, **approved** — never
*paid* or *unpaid*.

### The eight states

| | Eyebrow | Hero | Caption | Filled disc |
|---|---|---|---|---|
| **① Before the shift** | `NOT ON THE CLOCK`, dot in `field` | the rostered start `07:00` | `HBC Office · your shift starts in 12 minutes` | Clock in |
| **② Clocked in** | `ON THE CLOCK`, jade dot + 4pt halo | elapsed since `clockInAt` | `{workspace} · counted {n} · rest due {time}` | Clock out |
| **③ On a rest** | `ON A REST` in `warn` | rest elapsed, in `warn` | `Back at 11:24 · counted 2h 48m, not counting now` | End the rest |
| **④ Rest overdue** | `ON THE CLOCK` | elapsed | + a `warn` strip: `Your rest was due 32 minutes ago` | **Start the rest** |
| **⑤ Queued** | as ②, plus a `QUEUED` chip | elapsed | `{workspace} · waiting to reach the office` | Clock out |
| **⑥ Done for today** | `DONE FOR TODAY` | the day's counted total | `HBC Office · 06:45 → 15:00 · counted, waiting for approval` | **none** — Clock in again is unfilled |
| **⑦ Shift left open** | `NEEDS YOUR TIME` in `crit` | `When did you leave?` at h2 | `Yesterday at HBC Office. We closed it at 17:00 because it was left running.` | Set the real time |
| **⑧ Not rendered** | — | — | no workspace assignment, so the widget does not appear at all | — |

⚠️ **① shows the next thing, not a zero.** A 72pt `0` is the mistake the old
dashboard made with `0/12`.

⚠️ **② derives elapsed from `clockInAt`**, never counts up from mount. A phone
that slept through lunch must show the right number the instant it wakes. The
dot breathes only while somebody is working — a pulse that never stops is
decoration.

⚠️ **③ freezes the counted figure and says so.** A rest that silently keeps
counting is the bug that sentence prevents.

⚠️ **④ is the only place in the catalogue where the filled disc is not the
obvious one.** Clock out is still one tap away; it is simply not what is being
offered.

⚠️ **⑦ is driven by `AttendanceStatus.unconfirmedClockOut`** and is in no
widget spec. Until something claims it, the shift cannot be approved and
nothing asks.

### Data

From `src/offline/attendance/use-shift.ts` — **never the response cache.**
`/attendance/status` and `/attendance/breaks/status` are in the `NEVER` list in
`response-cache.ts` on purpose: a kept answer would reply first, older, and
pretend to be fresh, on the one card where that costs somebody a shift.

---

## 2 · Three kinds of worker

`User.scheduleType` is `FIXED | FLEXIBLE | NONE`, default `NONE`.

⚠️ **Neither `scheduleType` nor `monthlyHourBudget` is on the mobile `User`
type today.** Grepping `apps/mobile` for either returns nothing, so all three
kinds currently get the FIXED card. Add both to the login / validateToken
payload beside `allowRemote` and `orgAddOns`. **No new endpoint.**

The hero before clocking in is **whatever that person is measured against**:

| | The question | Hero when clocked out | Progress when on |
|---|---|---|---|
| `FIXED` | am I on time? | the rostered start `07:00` | today — `3h 12m of 8h` |
| `FLEXIBLE` | am I on track this month? | `84h of 160h`, days left | the month — `87h of 160h` |
| `NONE` | nothing is promised | this week's total | **no bar at all** |

⚠️ **`NONE` renders no progress track.** A bar with no target invents one.

⚠️ **Overtime means three different things**: past the rostered end for
`FIXED`, past the monthly budget for `FLEXIBLE`, nothing for `NONE`.

Once on the clock all three agree on the elapsed figure — that part is the same
job.

⚠️ `FLEXIBLE` needs a month-to-date total. Ask `/attendance/history` for it as
a **count** (page 1, limit 1, total from the envelope), the way
`pending-hours` does. Summing a month on the phone on every render is the wrong
shape.

---

## 3 · The discs

58pt, `radius-full`, `space-4` gap. **Exactly one is filled** with the jade
gradient and carries the primary shadow — its glow is what marks it primary,
not its size or position. The rest are `tile` with a hairline.

**Every disc carries a label.** Icons never carry meaning alone.

| Disc | Glyph | Goes to |
|---|---|---|
| Clock in / out | `ClockInGlyph` / `ClockOutGlyph` | the action, in place |
| Break | `BreakGlyph` | the action, in place |
| Report | `IssueNewGlyph` | §4 |
| My issues | `IssueMineGlyph` | §6 |

⚠️ **My issues badges an unread count, never a total** — whether anybody
replied to *you*.

⚠️ **The card itself is not a tap target.** Only its parts: the hero and
caption go to `/attendance`, each disc to its own action.

❌ **Activity leaves the card.** It belongs to a different widget. Four equal
full-width buttons is a menu, not a card.

---

## 4 · Report — the form

From the **Report** disc.

```
Report an issue                             h2

● HBC Office · on shift since 06:48 —       a tile
  this goes with the report                 caption

[ What is stopping you? ]                   field, sunken

HOW BADLY                                   eyebrow
[ Low ][ Medium ][ High ][ Urgent ]         pills

[ Anything that would help (optional) ]     field, 96pt

[ ＋ Add a photo ]                           dashed, secondary

[ Send to Anna Müller ]                     PRIMARY — jade
  She is notified straight away.            caption, centred
```

⚠️ **The primary is jade, not red.** Red means destructive. A member unsure
whether to report already hesitates; a red button confirms the hesitation.

⚠️ **Severity is neutral until it is not.** Only `HIGH` and `URGENT` take
colour.

⚠️ **Show the context that is already being sent.** `create()` takes
`timeEntryId` and `spaceId` — the shift and the workspace travel with every
issue, and nothing on screen says so. Say it before they type: it changes what
they write.

⚠️ **One photo button, not two.**

---

## 5 · Sent — a state that does not exist today

The form currently submits and returns the member to the card with **no
acknowledgement**. Add:

```
        ✓                                   72pt disc, accent-tint
      Sent                                  h2
  Anna Müller has it. You will see          centred
  her reply here.

┌────────────────────────────────────┐
│ High   Open · just now             │      the issue as filed
│ Compressor valve seized, cannot    │
│ isolate the line                   │
└────────────────────────────────────┘

[ Done ]                                    PRIMARY
  Open the thread                           text button
```

⚠️ **Naming who has it is the point.** *"Your responsible person is notified"*
is a promise; a name is a fact.

**Offline:** the same sheet, reading `Queued — Anna will get it when you have
signal.` The app is offline-first and this form gives no indication today.

---

## 6 · My issues — the list

```
My issues                              ✕

STILL OPEN · 2                              eyebrow
● Compressor valve seized      [High] (2)   solid dot, unread pill
  {name} is on it · 2h ago
● Olvidé reportar la hora…            ›
  Open · no reply yet

DONE · 1                                    eyebrow
○ Jacket print                        ›     hollow ring, ink2 title
  Aug 18 · closed by Anna Müller

[ ＋ Report an issue ]                       PRIMARY
```

### The six statuses — the sheet shows two today

```ts
type ShiftIssueStatus =
  'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'CANCELED';
```

⚠️ **`ACKNOWLEDGED` and `IN_PROGRESS` are the whole reason somebody reports
anything** — they are the difference between a reporting tool and a suggestion
box.

| Status | Dot | Reads as |
|---|---|---|
| `OPEN` | `warn`, solid | Open · no reply yet |
| `ACKNOWLEDGED` | `accent`, hollow ring | Seen by {name} |
| `IN_PROGRESS` | `accent`, solid | {name} is on it |
| `RESOLVED` | `muted`, hollow ring | Resolved |
| `CLOSED` / `CANCELED` | `muted`, hollow ring | Closed |

**Solid means it still wants something. Hollow means it does not.**

- **Grouped** by whether it is still yours to worry about.
- **Severity shows at `HIGH` and above only.** Below that it is noise.
- ⚠️ **`"5 updates"` is the wrong number.** The question is whether anybody
  replied to *you*.
- **Empty:** `Nothing reported.` with the Report primary beneath — never blank,
  and never the same sentence as a failed fetch.

---

## 7 · One issue — the thread

**The conversation is the feature, and today it is invisible** — the detail
sheet shows a composer and nothing above it.

```
[High]  ● Being fixed                  ✕
Compressor valve seized, cannot             h3
isolate the line
HBC Office · reported on your 06:48 shift   caption
──────────────────────────────────────
                    ┌──────────────┐
                    │ [photo]      │        yours: right, accent-tint
                    │ Valve on…    │
                    └──────────────┘
                      You · 08:12
┌──────────────┐
│ Seen — I am  │                            theirs: left, sunken
│ sending Karim│
└──────────────┘
  Anna Müller · 08:19
──────────────────────────────────────
[📷] [ Reply… ]                    [ ➤ ]
        Fixed? Mark it resolved             text link, centred
```

⚠️ **Acknowledge is not the reporter's action.** Today both *Acknowledge* and
*Resolve* appear as equal outline buttons. One sheet serves both roles, so it
has to know which one is looking:

| Viewer | Offered |
|---|---|
| The reporter | reply, add a photo, and a quiet `Mark it resolved` |
| The responsible person | `Acknowledge` while `OPEN`, then `Resolve` |

⚠️ **✓ / ✓✓ is a read-receipt metaphor.** It means *delivered / read*, not
*acknowledged / resolved*. Do not use it.

⚠️ **Resolve does not compete with the reply.** A text link under the composer,
not a button beside it — the common act here is answering.

⚠️ **Routing is server-side.** Shift issues reach the **workspace's watchers**,
not every org admin — the mistake that once put the owner on every late
departure. Nothing in these sheets re-derives it.

---

## 8 · Tokens

### Add `warn`

A wallet has *paid* and *declined*. A field app has a third state that is
neither — *owed*, *late*, *waiting for approval*, *rest overdue*. Encoding it
as `crit` makes every unapproved shift read as a failure.

| Token | Dark | Light |
|---|---|---|
| `warn` | `#f2b263` | `#8a5a10` |
| `warn-tint` | `#f2b2631f` | `#8a5a1018` |
| `warn-ink` | `#1a1200` | `#ffffff` |

Used by: the amber dot on `OPEN`, the rest-overdue strip, `HIGH` severity, the
FLEXIBLE budget bar, every unread badge.

### ⚠️ Two live contrast bugs

**`accent-lift` is illegible under white in light mode.**

```
white on accent-lift  #14a586   3.11:1   FAIL
white on accent-solid #0b8168   4.82:1   pass
```

The light primary gradient runs `accent-lift → accent-solid`, so white text
sits on the failing half — every *Clock out*, *Approve all*, *Send* in light
mode. **Fix:** run the light primary `#087961 → #0b8168` (5.36:1 / 4.82:1).

**`ink-onglass` is under AA on the Home gradient — dark only.**

```
dark   #9fbdb4 on glass over #0c4339   4.14:1   FAIL
light  #4e6b64 on glass over #bfe0d2   5.28:1   pass
```

The Home gradient's top stop is lighter than the interior one. **The caption
under the hero is the one at risk — check it in situ.**

---

## 9 · Rules

1. **One shape for all eight states.** Only eyebrow, figure and discs change.
2. **Exactly one filled disc**, and in state ④ it is not the obvious one.
3. **Every disc has a label.**
4. **Never say "paid".** The counted figure, called counted.
5. **Elapsed derives from `clockInAt`**, never a mount-time counter.
6. **`NONE` gets no progress bar.**
7. **Never read `/attendance/status` from the response cache.**
8. **Report's primary is jade.** Severity is neutral below `HIGH`.
9. **Show all six issue statuses**, solid for wants-something, hollow for not.
10. **Badge unread, never totals.**
11. **The reporter does not Acknowledge.**
12. **Routing stays server-side.**

---

## 10 · Check it worked

- Clock in, then out. The card **never changes shape** — same glass, same
  radius, same disc row.
- Put the phone to sleep on the clock for an hour. The elapsed figure is right
  **the instant it wakes**.
- Start a rest. The counted figure **stops**, and the caption says it stopped.
- Let a rest go overdue. The filled disc becomes **Start the rest**, and Clock
  out is still one tap away.
- Turn off the network and clock in. It works, and the card says `QUEUED`.
- Set a member to `FLEXIBLE`. The hero is a month, not a start time, and the
  bar targets the budget.
- Set a member to `NONE`. **There is no bar.**
- Report an issue. You land on **Sent**, and it **names the person who has it**.
- Have that person acknowledge it. The list row reads `Seen by {name}` with a
  hollow jade ring.
- Open the thread as the reporter. There is **no Acknowledge button**.
- Switch to light mode and look at every jade button. **No white text on
  `#14a586`.**
