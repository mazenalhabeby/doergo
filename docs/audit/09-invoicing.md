# Area 09 — Invoicing

Routes: `/invoices`, `/invoices/new`, `/invoices/[id]`. Gated by the `invoicing` add-on.

Status: **All six passes run. 1 finding fixed.** 0 Critical, **1 High**, 0 Medium.

---

## A. What this feature is (from the code)

**In one paragraph:** an admin gathers completed work for a client, turns it into line items,
and issues a numbered invoice with tax and discount. Totals are derived, not supplied. The
document is rendered to a customer-facing PDF.

---

## Findings

| ID | Sev | Pass | Title | Status |
|----|-----|------|-------|--------|
| I-B1 | **H** | B | A request body could overwrite the tenant — cross-organization write | **fixed** |

### I-B1 — the body won the argument about which organization this is **(High)**

Found by asking a mechanical question of every gateway controller: when a handler builds the
microservice payload, does the **client's body** or the **server's token** win?

```ts
{ ...body, organizationId: req.user.organizationId }   // server wins  — safe
{ organizationId: req.user.organizationId, ...body }   // CLIENT wins  — hole
```

Eighteen call sites had the safe order. **One did not** — `PATCH .../portal/units/:unitId`
in `space-portal.controller.ts`:

```ts
return this.auth('portal_update_unit', { id: unitId, organizationId: req.user.organizationId, ...body });
```

`portal.service.updateUnit` scopes its lookup with
`findFirst({ id, organizationId: data.organizationId })`. Since the body overwrote that
value, a member holding `canManageUsers` in organization A could send another organization's
id and edit **that organization's** unit — name, address, coordinates, resident, customer
binding. A cross-tenant write.

What did *not* save it: the body is typed `any`, so the global `ValidationPipe`
(`whitelist: true`, `forbidNonWhitelisted: true`) never inspected it. What partly hid it:
the attacker needs two cuids — the target unit's and the target org's. **Needing to know an
id is not an access control**, and both leak through shared spaces and former memberships.

**Fixed** by whitelisting the fields explicitly, the same treatment
`space-sharing.controller.updateShare` already carried — its comment names this exact trap,
so the pattern had been found once and not swept for.

**Fixed durably** by `tenant-override.spec.ts`, which walks every controller and fails if an
untyped body is ever spread after a server-set identity field.

> The scanner's first version flagged two join-request handlers with the same spread-last
> shape. They are safe: they spread a **typed DTO**, and `forbidNonWhitelisted: true` rejects
> an undeclared `organizationId` with a 400 before the handler runs. The rule is not "spread
> order"; it is "spread order **on an untyped body**", and the test now says so.

---

## Verified good (checked, no finding)

- **Money is computed server-side, never accepted.** Line amounts are `quantity × unitPrice`
  from the server's own arithmetic; `subtotal` reduces over them; tax and total derive from
  that. A client-supplied `amount` is ignored.
- **Invoice numbering handles its own race honestly.** The comment states that generation is
  read-then-write and therefore racy, names `@@unique([organizationId, invoiceNumber])` as
  the real guard, and retries on `P2002` by re-reading the latest number. That is the correct
  shape: the database enforces, the code recovers.
- **Writes are `@Roles(Role.ADMIN)`** — create, update, status change, delete, line items.
  Reads are `canViewAllTasks`. The split is right for a financial document.
- **`@RequirePlan('invoicing')` uses a real add-on key** — unlike the two dead keys found in
  Area 04, and now permanently checked by `gating-keys.spec.ts`.

## Open questions

- `quantity`, `unitPrice`, `taxRate` and `discount` are unbounded and untyped (the body is
  `any` here too). A negative unit price or a discount exceeding the subtotal produces a
  negative total; a non-numeric `taxRate` produces `NaN`. Only an ADMIN can reach it and it is
  their own invoice to their own client, so this is self-harm rather than a security issue —
  but it is a customer-facing PDF, and a typed DTO would close it. Left as a decision because
  bounding a discount could block a legitimate credit line.

## Verdict

**PASS WITH FIXES** — the High was not in invoicing itself; it was found by a sweep that
invoicing prompted.
