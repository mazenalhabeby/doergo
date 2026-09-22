# What is wrong today — measured

> Every number here was sampled out of a screenshot of the shipping app with
> PIL and computed against the surface it actually sits on, alpha composited.
> Nothing below is an opinion about taste.

---

## 1. The clocked-in card fails contrast in four places

Colours sampled from the live card:

| Element | Foreground | Background | Ratio | Needs | |
|---|---|---|---|---|---|
| **"Clock Out"** | `#ffffff` | `#43af8f` | **2.70:1** | 4.5 | ✗ |
| Inner buttons (label) | `#ffffff` | `#29a67e` | **3.07:1** | 4.5 | ✗ |
| "HBC Office · 0m" | `#ffffff` | `#199f75` | **3.36:1** | 4.5 | ✗ |
| "Clocked In" (22px) | `#ffffff` | `#199f75` | 3.36:1 | 3.0 | ✓ barely |

**2.70:1 is on the button that ends a paid shift**, used outdoors, often with
gloves on.

### And the buttons are invisible as shapes

| | Ratio |
|---|---|
| Inner buttons `#29a67e` vs card `#199f75` | **1.09:1** |
| "Clock Out" pill `#43af8f` vs card `#199f75` | **1.24:1** |

Below the threshold at which an edge reads at all. You only find those buttons
because white text is sitting on them.

---

## 2. The structural cause, in one sentence

**The colour is on the container, so it cannot mark the action.**

Once the whole card is brand green, green stops meaning *do this*. There is no
colour left to promote the primary action with — which is why Clock Out ended
up as a pale pill in the top-right corner, at roughly a third the area of
"Report an issue", at the furthest point on the card from a right thumb.

Take green off the card and give it to Clock out alone and the hierarchy
solves itself. No size, position or weight change is needed.

---

## 3. `scheduleType` never reaches the phone

```
User.scheduleType       "FIXED" | "FLEXIBLE" | "NONE"   (default: NONE)
User.monthlyHourBudget  Float?                          (for FLEXIBLE)
ContractType            FIXED_SCHEDULE | HOUR_BUDGET
```

Set on invite and on accept. Read in `auth.service.ts`,
`users.service.ts`, `onboarding.service.ts`, `invitation-apply.ts`,
`invitation.service.ts` and two gateway DTOs.

```
$ grep -rn "scheduleType\|monthlyHourBudget" apps/mobile/src apps/mobile/app
(no matches)
```

Neither field is on the mobile `User` type, so the card cannot tell which kind
of worker is looking at it — and draws the FIXED one for everybody.

**A member on an hour budget is shown a day they were never measured against.**
Since `NONE` is the column default, that is also what an unconfigured member
gets.

---

## 4. A shift state with no owner

`AttendanceStatus.unconfirmedClockOut` is a real field the shift reader already
returns: a shift that was left running and auto-closed at a temporary time,
waiting for the member to say when they actually left.

No widget in the 27 of `home-widgets.md` claims it. That shift cannot be
approved until somebody confirms the time, and nothing on the home screen asks.

---

## 5. The issue sheet shows two of six statuses

```ts
type ShiftIssueStatus =
  'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'CANCELED';
```

The list renders `Open` and `Resolved`. **ACKNOWLEDGED and IN_PROGRESS are the
whole reason a person reports anything** — they are the difference between a
reporting tool and a suggestion box.

### Smaller ones in the same sheet

- **Red primary.** Red means destructive everywhere else in the app and in
  every app beside it. A member unsure whether to report already hesitates.
- **Blue for Medium severity.** A hue that appears nowhere else in the system.
- **The dots are the wrong way round.** Blue on *Open*, orange on *Resolved* —
  the eye goes to the finished thing.
- **"5 updates" cannot answer the question**, which is whether anybody replied
  to *you*.
- **`timeEntryId` and `spaceId` are sent and never shown.** Every issue already
  travels with its shift and its workspace; the form does not say so, and it
  changes what somebody writes.
- **The thread is invisible.** The detail sheet shows a composer and no
  conversation.

---

## 6. Two more, for the record

- **The confirmation toast covers the system status bar** (screenshot at 9:17).
- **There is no sent state.** The form submits and the member is returned to
  the card with no acknowledgement that anything happened.
