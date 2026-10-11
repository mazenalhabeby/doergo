# Plan — Retire the B2B "Customers" directory; make Space ownership-aware (Project / My company / Customer company)

## Context

Today a **Space** (`CompanyLocation`) is the org's central unit (tasks, workflow, modules, members, attendance). Its "workspace vs physical" nature is only *derived* in the UI from whether it has coordinates — there's no stored type. Separately, there's a standalone **B2B "Customers" directory** (`/customers`, the `Customer` model with `isPortalResident=false`) used to tag tasks/reports with the company a job is for.

We want to **collapse "customer" into the Space model**: a space gains an **Ownership** classification — *My project / My company / Customer company* — and a "Customer company" space fully represents a customer (contact info, tasks/reports scoped to it, portal-linkable later). The standalone Customers directory goes away; existing B2B customers migrate to customer-company spaces.

**Critical constraint (do not break):** the **Clients Portals** feature stays. The `Customer` model is *dual-purpose* — portal residents are `Customer` rows (`isPortalResident=true`, tied to a `Portal`), and the portal-admin reuses `create_customer`/`list_customers`. So we **keep the `Customer` model + auth-service customers service** and only remove the **B2B directory surface** (`isPortalResident=false` usage). Portal residents, `CustomerUnit`, `User(role=CUSTOMER)`, `CustomerScopeGuard`, and portal task scoping are untouched.

Chosen design (confirmed): Ownership is a **separate axis** from workspace/physical; a Customer-company space **carries contact fields + is portal-linkable**; existing B2B data is **migrated**; ship as **classification-first** (behavior like customer reports/invoices/portal-attach is a follow-up).

---

## Phase 1 — Schema + migration + backfill (backend foundation)

**Schema** — `apps/api/auth-service/prisma/schema.prisma`
- New enum near the other enums (~:120): `enum SpaceKind { PROJECT COMPANY CUSTOMER }`.
- On `CompanyLocation` (~:1316): `kind SpaceKind @default(COMPANY)`; customer contact fields `contactName String?`, `contactEmail String?`, `contactPhone String?`; add `@@index([organizationId, kind])`.
- (Deferred, do NOT add now — classification-first) a `portalId` link on `CompanyLocation`; note it as the follow-up hook for portal-attach.
- Mirror the new fields on the shared client type `CompanyLocation` in `packages/shared/src/types/attendance.ts` (~:13-39) → rebuild shared.

**Migration** — additive only: new enum, `kind` (default COMPANY so every existing space stays valid), 3 nullable contact columns, one index. Hand-author under `apps/api/auth-service/prisma/migrations/` with `IF NOT EXISTS`/idempotent DDL (shadow DB is broken — follow the established hand-authored-migration pattern; note `CREATE INDEX CONCURRENTLY` for prod if large).

**Backfill = a one-off script, NOT SQL in the migration** (per the "backfill is a script not a migration" lesson): `apps/api/auth-service/prisma/backfill-customer-spaces.ts` (run with `tsx`, idempotent, org-scoped, guarded to skip if already run):
- For each `Customer` where `isPortalResident=false`: create a `CompanyLocation` with `kind=CUSTOMER`, `name`, `address`, `contactName/contactEmail/contactPhone` from the customer, same `organizationId`. Keep a `customer.id → space.id` map.
- Re-point that customer's tasks: `Task.spaceId = mappedSpace.id` for tasks whose `customerId` is a B2B customer (customer wins as the job's home space). Leave `Task.customerId` intact on **portal** tasks (resident) — those are `isPortalResident=true` and are skipped.
- Portal residents, `CustomerUnit`, and portal tasks are **not** touched.
- `ServiceReport.customerId` (B2B) is left as-is and flagged as a follow-up (reports are "later" behavior).
- Idempotency: tag created spaces (e.g. skip creating if a CUSTOMER space with same org+name already exists) so re-running is safe.

## Phase 2 — Space create/config UI + DTOs (the dynamic kind)

**Backend passthrough** (copy the existing `workModel` enum-validation pattern):
- `apps/api/gateway/src/modules/locations/dto/create-location.dto.ts` — add `kind` (`@IsIn(Object.values(SpaceKind))`, like `workModel` at :74-81) + optional contact fields; `update-location.dto.ts` inherits via `PartialType`.
- `apps/api/task-service/src/modules/locations/locations.service.ts` — persist `kind` + contact fields in the whitelisted `create()` payload (~:55-70) and `update()` (~:212, next to `workModel`).
- Web client types — `apps/web-app/src/lib/api.ts`: add `kind` + contact fields to `CreateLocationInput`/`UpdateLocationInput` (~:3329/3340) and the `CompanyLocation` type.

**Create UI** — `apps/web-app/src/app/(dashboard)/locations/_components/space-form.tsx`: add an **Ownership** selector (Project / My company / Customer company) as a second control next to the existing workspace/physical toggle (:55,:134-170); when `kind === CUSTOMER`, reveal contact fields (contactName/email/phone). Submit passes `kind` + contact fields.

**Config UI** — `apps/web-app/src/app/(dashboard)/locations/[id]/_components/general-tab.tsx`: same Ownership selector + conditional contact fields alongside the existing "Space type" card (:44,:146-208); `handleSave` includes them.

**Dynamic surfacing** (classification-first payoff): spaces list `apps/web-app/src/app/(dashboard)/locations/page.tsx` — add a kind badge + a kind filter (served by the new `@@index([organizationId, kind])`). Default new spaces in the create form to `COMPANY` (wizard-created spaces stay COMPANY).

## Phase 3 — Remove the B2B Customers directory

- **Web**: delete `apps/web-app/src/app/(dashboard)/customers/page.tsx` and `.../customers/[id]/page.tsx`; remove `customersApi` from `api.ts`; remove the "Customers" nav item in `apps/web-app/src/components/top-navbar.tsx` (:251 desktop, :675 mobile) and the link in `manage/page.tsx:32`. **Keep "Clients Portals".**
- **Gateway**: remove the `customers` REST module (`apps/api/gateway/src/modules/customers/*`) — it only served the web directory. **Keep** the auth-service `customers` module/service + its `create_customer`/`list_customers`/`get_customer`/`update_customer`/`delete_customer` cmds (portal-admin calls them directly).
- **Task creation**: audit where a B2B customer is selected/`task.customerId` is set for internal tasks; switch that picker to a **space picker filtered to `kind=CUSTOMER`** (sets `spaceId`), and stop setting `customerId` for B2B going forward. Portal task creation (`portal.controller.ts`) is unchanged (still sets `customerId` = resident).
- Resident management stays fully in the portal detail page's existing **Clients** tab (`/customer-portal/[id]`), which already lists/invites residents via `portalAdminApi` — so nothing is lost by removing `/customers/[id]`.

## Phase 4 — Verify + deploy

**Local verification**
- `pnpm --filter @hbcfield/shared build`; `tsc --noEmit` on auth/gateway/task/web; jest for auth/task/gateway.
- Apply the additive migration to local; run the backfill script; confirm: 8 CUSTOMER spaces created, 43 tasks now carry `spaceId`, portal residents/units untouched, portal still loads.
- Browser: create a Customer-company space (contact fields appear), see it in the spaces list with a kind badge/filter; confirm `/customers` is gone and `/customer-portal` still works.

**Prod deploy** (batched, only when you say go; follow the git-bundle-over-SSH → build changed services → `up -d` flow; rollback tag first):
- Additive migration auto-applies via the auth-service entrypoint.
- Run the backfill script **manually on prod once** after migrate (like the seed/role-backfill precedent) — it's idempotent and org-scoped.
- Rebuild auth-service, api-gateway, task-service, web-app (shared changed → also rebuild web; notification/tracking only if unaffected). Verify health + `/customer-portal` 200.

## Out of scope (explicit follow-ups)
- Customer-facing reports/invoices addressed to a Customer-company space; `ServiceReport` → customer-space remap.
- Portal-attach: linking a Clients Portal to a Customer-company space (add the deferred `CompanyLocation.portalId` then).
- Deep task cross-cutting (a task in a work-area space *and* for a customer) — current model keeps one `spaceId`; revisit only if needed.

## Risks / notes
- **Data**: backfill touches prod tasks (`spaceId`) — idempotent + org-scoped + reversible via the rollback tag + a kept `customerId` column (nothing dropped).
- **Coupling**: the only thing that could break the portal is removing the shared `Customer` backend — we explicitly keep it. Removing only the gateway `/customers` REST + web pages is safe.
- **Security/perf/scale**: `kind`/contact live on the already-org-scoped `CompanyLocation` row (no joins, indexed by `[organizationId, kind]`); customer-company spaces reuse the existing SpaceAssignment/space-access guards; removing the B2B directory shrinks attack surface.
