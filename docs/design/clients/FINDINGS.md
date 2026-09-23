# Findings — measured in the repo

---

## 1. ⚠️ No endpoint can answer this widget

`customers.controller.ts` reads activities per customer — `GET
/customers/:id/activities` — and has no cross-customer feed. A 214-client book
means 214 requests.

`GET /customers` returns no last-contacted date, so *"going cold"* is not
computable on the client either.

**§3.11 is marked Cost B. It is C.** See `ENDPOINT.md`.

---

## 2. ⚠️ The client list row is far too heavy for a widget

`MobileCustomer` carries `legalName`, `website`, `industry`, `vatId`,
`regNumber`, `locale`, `notes`, `managerIds`, `contactOf`, `crmCaps` — and
`details`, a JSON list the server caps at **30 rows, label ≤80 chars, value
≤2000**.

`customersApi.list()` defaults to `limit: 100`.

**Never call it from this widget.** Hundreds of kilobytes to draw three names,
and it would not answer the question anyway.

---

## 3. The headline cannot be a fixed phrase

```ts
export const REMINDER_KINDS = ['CALL', 'EMAIL', 'OTHER'] as const;
```

*"Owed a call"* is wrong the moment one is an email. The line has to read the
kinds — `SPEC.md` §2.

And the rule already exists: `summarisePending()` in
`packages/shared/src/documents/pending-summary.ts` solves *one line, several
kinds* for the documents reminder. Same shape, same place to put it.

---

## 4. ⚠️ A reminder's CALL and a logged CALL are opposite things

`packages/shared/src/crm/reminder.ts`, and the file says it exists because of
this confusion:

> "`reminderKind: 'CALL'` is an INTENT — remind me to call them on Tuesday. A
> `CustomerActivity` of type `CALL` is a RECORD — I called them. Same word,
> opposite direction in time. Both are wanted, so neither is removed; they are
> told apart by where the word sits, and **a reminder row must always render
> its reason** so 'Reminder · call' can never be mistaken for a call that
> happened."

**That sentence is the row's layout.** Verb first, `Reminder · kind · reason`
second, and the reason as **text**, never an icon — a glyph cannot say which
direction in time it points.

---

## 5. `MEETING` is deliberately not a reason

Same file:

> "MEETING is deliberately absent from the reasons. A meeting is real work that
> somebody is assigned and turns up to — that is a Task, not a nag. The enum
> still carries MEETING for activities that already happened."

⚠️ If this widget ever grows a "schedule a meeting" action, the fix is a job,
not a reminder.

---

## 6. `reminderAssigneeId: null` means everyone who manages the client

From the type: *"Null = every manager of this client."* And `managerIds` is
*"the members who look after this client… It decides who a reminder with no
assignee reaches."*

So one reminder can sit on three home screens and **one call clears all three.**
The row has to say so — `STATES.md` ⑤.

⚠️ `managerIds` has been on the wire all along: *"`customerSelect` in
auth-service has selected it since long before this type mentioned it."*

---

## 7. Both writes already work offline

`apps/mobile/src/offline/crm/client-actions.ts`:

> "EVERYTHING ABOUT ONE CLIENT TRAVELS IN ONE LANE, `crm:<customerId>`. Order
> within a lane is kept, so a stage tapped, an edit saved and a reminder ticked
> in a basement reach the server in the order they were made."

`customer.activityUpdate` — the Done tick — is already an outbox op. And
`client-overlay.ts`:

> "A queued change is not optimistic state living in a component — it is a
> fact."

**So the card's only write needs nothing built, and never shows a spinner.**

---

## 8. ⚠️ Two flags mark rows that are not clients

| | |
|---|---|
| `isContact` | *"A person who works at a company — NOT a client, and never billed as one."* |
| `isPortalResident` | *"a resident is somebody's tenant with an app login."* |

Excluded from the count, the rows, the cold tail and the All row's total.

---

## 9. Both of §3.11's permission warnings check out

`resolveCrmCaps(systemRole, permissions)` takes a **flat** `PermissionSet` — no
spaces — so CRM caps resolve off the org role only.

And `legacyViewAll = !!p.canViewAllTasks` maps straight to `view: 'all'`.

`ACCESS.md` has both in full.

---

## 10. The search this card links to already exists

`customers.tsx` pages the book at `PAGE_SIZE = 40` with a `search` param, and
`list` takes `spaceId`, `includeUnfiled`, `type`, `contacts` and
`portalResident`.

The All row is a **route**, not a fetch. Everything behind it is built.
