# Spec — the crew card

Widgets §3.6 `who-is-on`, §3.7 `pending-hours` and §3.8 `no-shows`, folded into
one registry row. The catalogue goes **25 → 23**.

Visual reference: board **④ Crew — who is on, who is late, what is waiting** at
https://claude.ai/artifact/9GcjYhxdrUEaL7NAVstB7U

---

## 1. Why one row and not three

| | §3.6 | §3.7 | §3.8 |
|---|---|---|---|
| Permission | `canViewSpaceAttendance` | same | same |
| Tap target | `/manage/attendance` | same | same |
| Subject | the crew, now | the crew's shifts | the crew, absent |

Same permission — **verified on the gateway controller**, not taken from the
doc — same destination, same subject.

And §3.8 is *"Hidden when empty"*. A registry row that is absent on most days
is the clearest signal in the catalogue that something belongs **inside** a
widget rather than beside it.

```ts
{
  key:   'crew',
  title: 'widgets.crew',
  requires: {
    module:     'time_tracking',
    permission: 'canViewSpaceAttendance',
    self:       false,
  },
  Component: CrewCard,
}
```

---

## 2. Anatomy

```
┌─ glass, radius 30 ───────────────────────────┐
│  CREW                        ● 13:20    ⋯    │  header
│                                              │
│  6/9  on the clock                           │  hero
│  BILLA AG 4/5 · MAIN OFFICE 2/4              │
│                                              │
│  ┌────────┐┌────────┐┌────────┐┌────────┐    │  the rail — sideways
│  │ (KB) ☎ ││ (PJ)   ││ (AM)   ││ +15    │ →  │
│  │ Karim  ││ Pia    ││ Anna   ││ steady │    │
│  │ Main.. ││ Billa  ││ Billa  ││        │    │
│  │ 47     ││ 25     ││ 0h 20  ││ Nothing│    │
│  │ min late│ min left│ over   ││ to dec.│    │
│  │ EXP 08:00│06:00→13:45│07:00→15:30│     │  │
│  └────────┘└────────┘└────────┘└────────┘    │
│              ▬▬ ·  ·                          │  scroll dots
│  ──────────────────────────────────────────  │
│  [⚠] 2 not arrived                       ›   │  exceptions
│      Karim Bauer 47 min · Mo Osei 12 min     │
│  [⧗] 31 hours waiting                    ›   │
│      Oldest is 11 days · Anna Müller         │
└──────────────────────────────────────────────┘
```

**Glass**, like the shift clock — the third and last glass card in the
catalogue. Everything else in the set is a well, because a list over a gradient
is what dies in sunlight.

---

## 3. The tile — six lines, one person

| Line | Source | ⚠️ |
|---|---|---|
| **the ring** | `clockInAt → expectedClockOutAt` | Not always drawable — `FINDINGS.md` §3 |
| **the dot** | state: solid jade on, hollow warn break, crit late | |
| **the name** | first name only | A row of initials is a puzzle |
| **the place** | workspace name | Decides whether you can walk over |
| **the figure** | **time left**, not time worked | The manager's question |
| **the span** | `07:00 → 15:30`, 9.5pt mono | Evidence under the claim |

**"Time left" is the point.** Every other attendance surface in the app shows
hours *worked*. A manager at 13:20 does not need that — they need to know Pia
is free in 25 minutes.

### The four faces

| State | Ring | Dot | Figure | Action |
|---|---|---|---|---|
| **Late** | dashed crit, **no arc** | crit | `47 min late` | **Call** disc |
| **Free soon** | jade, nearly closed | jade | `25 min left` in jade | — |
| **On a break** | dashed warn arc | hollow warn | `12 min break` | — |
| **Past the end** | full jade + warn tail past the top | warn | `0h 20 over` | — |
| **On the clock** | jade arc | jade | `2h 10 left` | — |
| **Not in** | none | none | dimmed to .55 | — |

⚠️ **Late gets no arc.** There is no shift underway to be a fraction of. It is
the only tile that carries an action, and the only one drawn in `crit`.

---

## 4. The avatar

```ts
imageUrl: m.avatarUrl || undefined,
initials: getInitials(m.firstName, m.lastName),
```

Both paths already exist in `admin-dashboard.tsx`. When there is no photo, the
fallback is **initials on a deterministic low-chroma ground** — six grounds,
picked from the initials, all dark, all one ink. Six grounds and one ink is
what makes a row of people read as a family rather than a chart.

⚠️ Do not use accent hues for the grounds. The jade is the ring's job, and a
disc competing with its own ring loses both.

---

## 5. Scale

`SCALE.md`, and it is not optional. Two rules:

1. **The rail is not a roster** — a tile only exists when there is something to
   decide. Everyone steady is a chip with a count.
2. **The unit is derived from the scope** — 1 workspace shows people, 4+ shows
   workspaces.

Together they mean the card's height tracks *how much is happening*, not how
many people exist.

---

## 6. States

`STATES.md`. Six, and the important ones are:

- **Calm** — no tiles at all. A good morning should *look* like one.
- **Before the first shift** — the rail shows who is coming and when.
- **Offline** — the hero goes to `—`. §3.6: *presence is a now question; stale
  is wrong, not old.*

---

## 7. Copy

| | |
|---|---|
| Hero | `{on}/{total}` · `on the clock` |
| Hero, no roster | `{on}` · `on the clock right now` — see `FINDINGS.md` §1 |
| Empty | `Nobody is on shift right now.` (§3.6's own string; it is a true and useful statement) |
| Calm | `Everyone is in. Nothing waiting.` |
| Offline | `Needs a connection. A kept answer would be wrong, not old.` |
| Steady chip | `+{n}` · `steady` · `Nothing to decide.` |
| Exceptions | `{n} not arrived` · `{n} hours waiting` |

---

## 8. Offline

**Not kept**, and this is the one widget where that is a feature. §3.6:
*"Presence is a now question. Stale is wrong, not old."*

So the hero renders `—`, the tiles render as empty placeholders, and the card
says why. It does not show this morning's numbers at four in the afternoon.

⚠️ Contrast with `my-route`, where the kept plan is exactly right. The rule is
not "cache everything" or "cache nothing" — it is whether the answer has a
shelf life.
