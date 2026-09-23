# Access — the CRM caps, and two traps

Both of §3.11's warnings are real. I checked them in
`packages/shared/src/types/permissions.ts`.

---

## The gate

```ts
{
  key:   'clients',
  title: 'widgets.clients',
  requires: { module: 'crm', permission: /* see below */, self: false },
  Component: ClientsCard,
}
```

The module is `crm`. The permission is **not a key** — it is the result of
`resolveCrmCaps(...)`:

| `view` | The card |
|---|---|
| `'all'` | The whole book. Any client's reminder reaches you |
| `'own'` | Clients whose `managerIds` contains you |
| `'none'` | **No card, and no request.** The member never pays for a book they may not read |

⚠️ `view: 'none'` is not an empty card. §2.4 rule 4 — *nothing is
visible-then-refused* — applied before the network, not after it.

---

## ⚠️ Trap 1 — CRM caps ignore spaces entirely

```ts
export function resolveCrmCaps(
  systemRole: string | null | undefined,
  permissions: PermissionSet | null | undefined,   // ← flat. no spaces.
): CrmCaps
```

There is no `access`, no `spacesGranting`, no scope of any kind. **CRM
abilities resolve off the member's ORG role only.**

§3.11's own words: *"a space-scoped sales role grants nothing while looking
configured."*

So a rep given "CRM work" inside one workspace has a role that reads correctly
in the admin UI and grants **nothing** on the phone. The widget will simply not
appear for them, and nothing will explain why.

⚠️ **This is not the widget's bug to fix.** Do not work around it with a
space-aware check of your own — that would make the card disagree with every
other CRM surface. If it needs fixing, it is fixed in `resolveCrmCaps`.

---

## ⚠️ Trap 2 — `canViewAllTasks` hands over the whole book

```ts
// Backward-compat bridge: before CRM caps existed, CRM read = canViewAllTasks
// and CRM write = canManageUsers.
const legacyViewAll = !!p.canViewAllTasks;   // read-only CRM (see everything)

let view: CrmViewScope =
  p.crmViewAll || legacyManage || legacyViewAll ? 'all' : p.crmViewOwn ? 'own' : 'none';
```

**`canViewAllTasks` maps straight to `view: 'all'`.**

§3.11: *"Never grant a sales role `canViewAllTasks` — the resolver treats it as
the legacy 'read every client' and silently hands over the whole book."*

The bridge is deliberate and documented — it stops existing manager roles
losing access the day CRM caps shipped. But it means a permission about **jobs**
silently grants the **client list**.

⚠️ Worth an admin-facing warning on the role editor, which is outside this
widget.

---

## Per-record caps, for later

`MobileCustomer.crmCaps` — *"the caller's CRM abilities on THIS record,
returned by the single-client read. The screen hides what may not be done; the
server refuses it anyway."*

The widget does not need it: every row it shows is a reminder the caller can
already see, and the only write is ticking it done. But `/customer/[id]` behind
the row does, and that is where it already lives.

---

## Who is not a client

Two flags on `MobileCustomer`, both with the answer in their own comment:

| | |
|---|---|
| `isContact` | *"A person who works at a company — NOT a client, and never billed as one."* |
| `isPortalResident` | *"a resident is somebody's tenant with an app login, not a person you name as the contact at a firm."* |

⚠️ **Both are excluded from every part of this card** — the count, the rows,
the cold tail and the All row's total. A tenant does not owe you a call.

---

## And nothing here is a queue

`needs-you` owns the queues that wait on a manager. This card is the opposite
shape: it is **your own list**, and the reminders on it were set by you or by
somebody who manages the same client.

That is why there is no approve, no reject, and no second face.
