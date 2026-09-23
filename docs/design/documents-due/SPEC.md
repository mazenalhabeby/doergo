# Spec — Documents needing you

Widget §3.16 `documents-due`. **One registry row, no folds** — it is already
one row that carries four kinds of obligation, and the existing component
argues that case better than a spec could. See `FINDINGS.md` §5.

Visual reference: board **⑨ Documents needing you** at
https://claude.ai/artifact/9GcjYhxdrUEaL7NAVstB7U

---

## 1. Registry

```ts
{
  key:   'documents-due',
  title: 'widgets.documentsDue',
  requires: { module: null, permission: null, self: true },
  Component: DocumentsReminderCard,
}
```

**No module and no permission.** Everyone, about themselves. The gate is
whether anything is outstanding, and that is content, not entitlement.

⚠️ See `FINDINGS.md` §4 — the subject exemption. A document type restricted to
other roles still shows a member what is required **of them**.

---

## 2. Anatomy

```
┌─ well, radius 24 ─────────────────────────┐
│  ┌────┐                                   │
│  │ 📄 │  2 documents needed          ›    │  15.5/22
│  └────┘  Driving licence · First aid      │  12.5/18 muted
└───────────────────────────────────────────┘
```

A 44pt tinted tile, a title, a subtitle, a chevron. That is the whole card —
and the existing implementation is right that it should stay that way:

> "It sits directly above Clock In, and a card a few pixels off in padding,
> radius or icon size is the most obvious way for a screen to look unfinished.
> **The tone lives in the ICON TILE**, the one thing allowed to differ between
> an ordinary action and an urgent one."

---

## 3. Which obligation gets the line

`summarisePending()`, unchanged:

| Headline | When | Subtitle |
|---|---|---|
| `needYou` | both kinds outstanding | **counts** — "2 to supply · 1 to sign" |
| `needed` | to supply | **names** |
| `toSign` | waiting on a signature | **names** |
| `expiring` | nothing else outstanding | **names** |

Two rules already in the function and worth keeping:

> "Expiry is only ever the headline when nothing is actually outstanding. A
> certificate running out in three weeks next to a document that is missing
> today is noise."

> "One kind: name them. A bare count makes somebody open the screen just to
> find out which, a round trip the sentence could have saved."

⚠️ **Tone does not follow the headline.** `blocksWork` on any single
requirement makes the whole row `crit`, whatever the title says.

| Tone | When | Mark |
|---|---|---|
| `crit` | `blocksWork` | `DocBlockedGlyph` |
| `warn` | to supply, or to sign | `DocNeededGlyph` / `SignGlyph` |
| `accent` | expiring only | `DocExpiringGlyph` |

---

## 4. The two cases that grow a second line

Everything above fits one line. Exactly two things do not, and both are
`FINDINGS.md` items.

### Sent back

```
[✕]  Driving licence was sent back            ›
     Sent 2 days ago
     ─────────────────────────────────────────
     ● "The photo is cut off at the bottom — we
        need the whole card."
```

Headline above `needed`, because a rejected document is more urgent than an
absent one: the member believes they have already done it.

The second line is `reviewNote`, quoted. Without it the member repeats the
mistake — which is the entire reason this state needs its own row.

### Somebody else's signature

```
[≡]  Sign Anna Müller's time sheet             ›
     Waiting on you since Friday
     ─────────────────────────────────────────
     ● Somebody else's document, waiting on you.
```

`forMember` names the person. **A colleague is blocked**, and that is a
different instruction from "1 document to sign".

⚠️ These are the **only** two second lines. The card's own rule — *"the line
changes instead of multiplying"* — holds everywhere else.

---

## 5. Marks

`../icons/doc-glyphs.tsx`. Four of the five are **one identical sheet with a
different badge bitten out of its corner**:

| | Badge |
|---|---|
| `DocNeededGlyph` | a plus — not sent yet |
| `DocExpiringGlyph` | an hour hand — held, running out |
| `DocSentBackGlyph` | a cross — sent, refused |
| `DocBlockedGlyph` | an exclamation — missing, and stopping work |

⚠️ That sameness is deliberate and inverts the family's usual rule. **The row
shows exactly one of them**, so they never compete — and they are the same
object in four conditions, so they should look it.

`CountersignGlyph` is the exception: two sheets and a figure, because it is
the only one that is not about a document of yours.

`SignGlyph` (`tile-glyphs.tsx`) is reused for signing your own. Not redrawn.

---

## 6. Data

```ts
GET /documents/requirements   // what you have NOT got
GET /documents/pending        // toUpload · expiring · toSign, in one request
```

The second exists precisely to avoid two calls:

> "Separate from `requirements` because the reminder needs BOTH kinds — types
> to supply and documents awaiting a signature — and two requests for one badge
> is how a reminder ends up being removed again for being slow."

⚠️ Findings 1 and 2 require changes to `summarisePending()` in
`packages/shared` — **not in the widget.** The web reads the same function,
*"so the two can never quote different numbers for the same person."*

---

## 7. Offline

Kept. §3.16 says so, and it is right: an obligation does not stop existing
because the phone lost signal, and the answer does not go stale in a way that
misleads — a document you owed this morning you still owe.

⚠️ Unlike `crew`, where stale is wrong. The rule is not "cache everything" or
"cache nothing"; it is whether the answer has a shelf life.

---

## 8. Copy

Every string exists today under `documents.reminder.*`. New keys needed, and
only these:

| Key | Text |
|---|---|
| `documents.reminder.sentBack` | {label} was sent back |
| `documents.reminder.sentBackWhen` | Sent {age} ago |
| `documents.reminder.countersign` | Sign {name}'s {label} |
| `documents.reminder.countersignWhen` | Waiting on you since {day} |
