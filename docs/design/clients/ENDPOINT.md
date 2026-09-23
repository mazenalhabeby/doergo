# The endpoint this widget needs

> Read this first. Everything else in the folder assumes it, and without it the
> widget cannot be built at any cost.

---

## The problem

§3.11 asks: *"Who is owed a call, and whose quote is going cold?"* and lists
`GET /customers` plus reminders as the data.

**Reminders are read one client at a time.**
`apps/api/gateway/src/modules/customers/customers.controller.ts`:

```
@Get(':id/activities')   // a customer's CRM timeline
```

There is no cross-customer feed. Answering the widget's question for a
214-client book means **214 requests**.

And the second half is no better: `GET /customers` returns `name`, `type`,
`status`, `managerIds`, `contactOf`, `createdAt` — **no last-contacted date**.
"Going cold" is not computable on the client either.

**§3.11 is marked Cost B. It is C.**

---

## What to build

```
GET /crm/due?limit=5&coldAfterDays=30
```

```ts
{
  due: {
    customerId:   string;
    name:         string;
    type:         'PERSON' | 'COMPANY';
    activityId:   string;            // to PATCH done
    reminderKind: 'CALL' | 'EMAIL' | 'OTHER';
    body:         string | null;     // the reason — see SPEC §3
    dueAt:        string;
    phone:        string | null;     // for tel:
    email:        string | null;     // for mailto:
    assigneeId:   string | null;     // null = every manager
    managerCount: number;            // so the row can say "any of 3"
  }[];
  cold: {
    customerId: string; name: string; type: 'PERSON' | 'COMPANY';
    lastTouchedAt: string | null;
    phone: string | null;
  }[];
  coldCount:  number;
  totalClients: number;              // the All row's number
}
```

**One request answers the whole card.** The cold tail and the book's total ride
along, so no state of this widget ever costs a second call.

---

## The query

One indexed read for `due`:

```
CustomerActivity
  where type = 'REMINDER'
    and doneAt is null
    and dueAt <= now()
    and customer matches the caller's CRM scope
  order by dueAt asc
  limit 5
```

and one for `cold`:

```
Customer
  where the caller's CRM scope
    and no CustomerActivity since now() - coldAfterDays
    and not isContact and not isPortalResident
  order by lastTouchedAt asc
  limit 5
```

⚠️ **The scope is `resolveCrmCaps(...).view`**, not a raw organization filter —
`'all'` is the book, `'own'` is clients whose `managerIds` contains the caller,
`'none'` never reaches the endpoint because the widget is not offered. See
`ACCESS.md`.

⚠️ **`isContact` and `isPortalResident` are excluded from both.** *"A person who
works at a company — NOT a client, and never billed as one"*, and a resident is
*"somebody's tenant with an app login"*. Neither owes you a call.

---

## Why not do it on the client

`customersApi.list()` defaults to `limit: 100`, and every row is the whole
`MobileCustomer`: eight company fields, `notes`, `managerIds`, `contactOf`,
`crmCaps`, and `details` — a JSON list the server caps at **30 rows of up to
2,080 characters each**.

That is hundreds of kilobytes to draw three names, and it still would not
answer the question, because the reminders are not in it.

⚠️ **Never call `customersApi.list()` from this widget.** The only exception is
nothing: the All row is a link, not a fetch.

---

## It is wanted twice

`apps/mobile/app/(app)/customers.tsx` pages the book at `PAGE_SIZE = 40` and
has no "today" view. The same endpoint gives that screen its own first tab, so
this is not a feature built for one card.

---

## Until it exists

There is no reduced version worth shipping. A card that lists clients without
saying **why** each one is surfacing is a directory, and the app already has
one at `/customers`.

If the endpoint is not going to be built, **do not build the widget** — put
`Clients` in the shortcuts rail as a badged tile and leave it there.
