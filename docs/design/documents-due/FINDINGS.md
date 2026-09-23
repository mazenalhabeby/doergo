# Findings — measured in the repo

Two of these are the whole design work. The rest is a restyle.

---

## 1. ⚠️ A rejected document is indistinguishable from a missing one

`documentsApi.requirements()` returns:

```ts
state: 'MISSING' | 'AWAITING_REVIEW' | 'REJECTED' | 'MET' | 'EXPIRING' | 'EXPIRED'
```

`summarisePending()` in `packages/shared/src/documents/pending-summary.ts` takes:

```ts
input: {
  toUpload: { label: string; blocksWork?: boolean }[];
  toSign:   { title: string }[];
  expiring: { label: string }[];
}
```

**`REJECTED` is not one of its inputs.**

So a member whose driving licence came back is told *"1 document needed"* —
the same sentence as somebody who never sent one — and photographs the same
cut-off card again. The `reviewNote` that says why exists on the record and
nothing on the phone shows it.

**Fix.** Pass the rejected requirements through, give them their own headline
above `needed`, and put the reviewer's note on a second line. This is one of
exactly two cases where the single row is not enough — see `SPEC.md` §4.

---

## 2. ⚠️ `forMember` is on the type and dropped before the row is built

`apps/mobile/src/lib/api/documents.ts`:

```ts
// `forMember` is set when the document belongs to somebody else and is
// waiting on you — a responsible countersigning a worker's time sheet.
// Null on your own.
toSign: { id: string; title: string; forMember?: string | null }[];
```

`summarisePending`'s input drops it: `toSign: { title: string }[]`.

So the row cannot tell you whether a signature is **your own admin** or **a
colleague blocked on you.** Those are not the same errand and they do not
deserve the same sentence.

**Fix.** Keep `forMember` through the summary and name the person. *"Sign Anna
Müller's time sheet"* is a different instruction from *"1 document to sign"*,
and only one of them has somebody waiting at the other end.

---

## 3. `AWAITING_REVIEW` may be chasing people who already sent it

The state exists precisely to mean *sent, not yet judged*. If a document in
that state still appears in `pending.toUpload`, the member is asked again for
something already on somebody's desk.

⚠️ **Check the server before building.** If it is in `toUpload`, either the
server should drop it or the row should say *"1 document with the office"* —
which is information, not an obligation, and belongs in the `expiring` tone
rather than the `needed` one.

---

## 4. The subject exemption is load-bearing

§3.16's own ⚠️, and worth restating because it is easy to break while
tightening permissions:

> "A member always sees what is required **of them**, even for a document type
> restricted to other roles. Otherwise restricting a type leaves somebody
> unable to hand in their passport while a screen goes on chasing them for it."

The requirement is about the subject, not about the reader. A type's
`visibleToRoleIds` governs who may look at **other people's** documents of that
type; it must never hide a person's own obligation from them.

---

## 5. What is already right, and must not be "improved"

`documents-reminder-card.tsx` is 112 lines and a third of them are the
argument. Four decisions are already made and correct:

**One card, home screen only.**

> "The tempting version of this feature puts a banner on every screen, and that
> version stops working within a week: people learn the shape of a thing that is
> always there and read past it, so the day it finally matters it is invisible."

**Renders nothing when nothing is outstanding.** The normal case.

**No dismiss button.**

> "Dismissing either hides a real obligation or teaches people that the reminder
> is optional, and there is already a way to make it go away — supply the
> document."

**Two tones.**

> "Something that stops work being assigned is a blockage and looks like one; a
> certificate running out in three weeks is information, and dressing it as an
> alarm is what makes people stop believing the alarms."

And the reason it is one row rather than two cards:

> "The line changes instead of multiplying."

---

## 6. The summary rule is shared with the web, deliberately

> "The rule is shared with the web so the two can never quote different numbers
> for the same person."

`summarisePending()` lives in `packages/shared`. **Any change from findings 1
and 2 goes there**, not in the widget — or the phone and the web start
disagreeing about how many things a person owes.

---

## 7. Cost A, and it means it

| | |
|---|---|
| Component | `documents-reminder-card.tsx`, used by four home variants |
| Endpoints | `GET /documents/requirements`, `GET /documents/pending` |
| Summary rule | `packages/shared/src/documents/pending-summary.ts` |
| Hook | `useDocumentRequirements()` |

The work is a restyle plus two fields that are already on the wire.
