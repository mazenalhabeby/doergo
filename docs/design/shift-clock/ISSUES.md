# Report an issue / My issues — the flow

> Two discs on the shift card, three sheets, one thread.
>
> API: `apps/mobile/src/lib/api/shift-issues.ts`
> Sheet today: `apps/mobile/src/components/shift-issue-sheet.tsx`

---

## 1. The model you already have

```ts
type ShiftIssueStatus =
  'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'CANCELED';
type ShiftIssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
```

`create()` takes `{ title, description?, severity?, timeEntryId?, spaceId? }`.

**The sheet renders two of the six statuses.** `ACKNOWLEDGED` and
`IN_PROGRESS` are the whole reason somebody reports anything — they are the
difference between a reporting tool and a suggestion box.

| Status | Dot | Reads as |
|---|---|---|
| `OPEN` | `warn`, solid | Open · no reply yet |
| `ACKNOWLEDGED` | `accent`, hollow ring | Seen by {name} |
| `IN_PROGRESS` | `accent`, solid | {name} is on it |
| `RESOLVED` | `ink-muted`, hollow ring | Resolved |
| `CLOSED` / `CANCELED` | `ink-muted`, hollow ring | Closed |

Solid means it still wants something. Hollow means it does not.

---

## 2. Report — the form

Entered from the **Report** disc.

```
Report an issue                             h2

● HBC Office · on shift since 06:48 —       a tile, surface-tile
  this goes with the report                 caption

[ What is stopping you? ]                   field, radius-field, sunken

HOW BADLY                                   eyebrow
[ Low ][ Medium ][ High ][ Urgent ]         pills, radius-full

[ Anything that would help (optional) ]     field, 96px

[ ＋ Add a photo ]                           dashed, secondary

[ Send to Anna Müller ]                     PRIMARY — jade
  She is notified straight away.            caption, centred
```

### ⚠️ The primary is jade, not red

Red means destructive everywhere else in the app and in every app beside it. A
member unsure whether to report already hesitates; a red button confirms the
hesitation. Reporting a blocker is the behaviour you want more of.

### ⚠️ Severity is neutral until it is not

| | Colour |
|---|---|
| `LOW` | `ink-muted` |
| `MEDIUM` | `ink` |
| `HIGH` | `warn` |
| `URGENT` | `critical` |

Today `MEDIUM` is blue — a hue that appears nowhere else in the system. Low and
Medium should stay quiet; only High and Urgent take a colour, and they take the
one they already mean.

### ⚠️ Show the context that is already being sent

`timeEntryId` and `spaceId` ride on every `create()`. The member cannot see
that, and it changes what they write — "the valve" means something different
when the reader knows which site and which shift. One tile, before the first
field.

### ⚠️ One photo button, not two

Camera and Photo as separate buttons is a platform detail leaking into the
design. One **Add a photo** that offers both.

---

## 3. Sent — the state that does not exist today

The form submits and the member is returned to the card with no
acknowledgement. Add:

```
        ✓                                   72px disc, accent-tint

      Sent                                  h2
  Anna Müller has it. You will see          body, centred
  her reply here.

┌────────────────────────────────────┐
│ High   Open · just now             │      the issue as filed
│ Compressor valve seized, cannot    │
│ isolate the line                   │
└────────────────────────────────────┘

[ Done ]                                    PRIMARY
  Open the thread                           text button
```

Naming who has it is the point. "Your responsible person is notified" is a
promise; a name is a fact.

**Offline:** the same sheet, with `Queued — Anna will get it when you have
signal.` The whole app is offline-first and this form gives no indication
today.

---

## 4. My issues — the list

Entered from the **My issues** disc, which badges an **unread count** — never a
total.

```
My issues                              ✕

STILL OPEN · 2                              eyebrow
● Compressor valve seized      [High] (2)   solid dot, unread pill
  {name} is on it · 2h ago
● Olvide reportar la hora…            ›     solid dot
  Open · no reply yet

DONE · 1                                    eyebrow
○ Jacket print                        ›     hollow ring, ink2 title
  Aug 18 · closed by Anna Müller

[ ＋ Report an issue ]                       PRIMARY — jade
```

- **Grouped** by whether it is still yours to worry about.
- **Severity shows at `HIGH` and above only.** Below that it is noise.
- **`"5 updates"` is the wrong number.** The question is whether anybody replied
  to *you*. A grey total cannot answer it; an unread count in jade can.
- Resolved rows drop to `ink` for the title and a hollow ring for the dot.

**Empty:** `Nothing reported.` with the Report primary beneath. Never blank,
and never the same sentence as a failed fetch.

---

## 5. One issue — the thread

**The conversation is the feature, and today it is invisible** — the detail
sheet shows a composer and nothing above it.

```
[High]  ● Being fixed                  ✕    severity pill + status
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
[📷] [ Reply… ]                    [ ➤ ]    composer
        Fixed? Mark it resolved             text link, centred
```

### ⚠️ Acknowledge is not the reporter's action

Today both **Acknowledge** and **Resolve** appear as equal outline buttons. The
reporter acknowledging their own issue means nothing — acknowledging is what
the responsible person does.

One sheet serving both roles has to know which one is looking:

| Viewer | Offered |
|---|---|
| The reporter | reply, add a photo, and a quiet `Mark it resolved` |
| The responsible person | `Acknowledge` while `OPEN`, then `Resolve` |

And ✓ / ✓✓ is a read-receipt metaphor. It means *delivered / read*, not
*acknowledged / resolved*.

### ⚠️ Resolve does not compete with the reply

A text link under the composer, not a button beside it. The common act in this
sheet is answering; closing it is occasional.

---

## 6. Routing

Shift issues reach the **workspace's watchers**, not every org admin — the
mistake that put the owner on every late departure once already. That routing
exists server-side; nothing in these sheets should re-derive it.
