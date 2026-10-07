# Companies — several legal entities in one organization

Mockup (Arabic narration): https://claude.ai/artifact/WnqZqzmgVB6knVAo2Tvyyt — approved 2026-10-07.

## Why

HBC runs two organizations (HBC GmbH, HBC USA Inc.) only so invoices carry the Austrian or the US
identity. Everything else (people, clients, workspaces, rota, calendar, reports, chat, billing) is
organization-scoped in ~200 tables and a user belongs to ONE organization, so two organizations means
two logins, split data and two bills. What actually differs is the identity on the paperwork.

## Model

- `LegalEntity` (table `legal_entities`) — one per legal company inside an organization:
  legal name, short label, address (line1/2, postal code, city, state, country), VAT id, tax id (EIN…),
  register number, email, phone, website, logo, currency, invoice prefix, `isMain`, `isActive`.
  Exactly ONE main per organization (partial unique index).
- `LegalEntityBankAccount` — bank accounts of an entity (label, holder, bank name, IBAN, BIC, account
  number, routing number, currency, `isDefault`).
- Links (all nullable, `SET NULL` on delete): `CompanyLocation.legalEntityId` (who invoices this
  workspace), `Customer.legalEntityId` (who invoices this client), `User.employerEntityId` (employer),
  `Invoice.legalEntityId` + `Invoice.issuer` (JSON snapshot frozen when issued).
- Migration BACKFILLS one main entity per organization from its profile (prefix `INV`, so numbering is
  unchanged), points every existing invoice at it and freezes the snapshot of every non-draft invoice.

## Rules (shared `packages/shared/src/billing/legal-entity.ts` — one copy for server and web)

- **Who issues** (`resolveIssuerEntityId`): the invoice's own choice → the workspace's → the client's
  → the organization's main entity. An inactive or foreign id never resolves.
- **Numbers**: `{prefix}-{year}-{0001}`, one series per entity per year (`@@unique([organizationId,
  invoiceNumber])` still guards; a collision retries). Main keeps `INV`, so nothing renumbers.
  Changing the company of a DRAFT re-numbers it under the new series; an issued number never changes.
- **Snapshot**: issuing writes `issuer` (identity + default bank account); back to draft clears it;
  a non-draft invoice ALWAYS renders the snapshot — an address change next year must not rewrite a
  filed invoice. A draft renders the live entity.
- **Validation**: IBAN mod-97, BIC shape, US ABA routing checksum, prefix `[A-Z0-9]{1,8}`, ISO country,
  supported currency. Refused with a code, never silently dropped.

## Security

- Every read and write scoped by the token's `organizationId`; ids from the body are checked to belong
  to it (entity on invoice/workspace/client/member).
- Read the list (no bank details): any internal member who issues invoices or manages workspaces/clients
  needs the names → `canManageInvoices` OR `canManageWorkspaces` OR CRM edit; **bank accounts** only to
  `canManageInvoices` and admins. Write: **admins only** (legal and bank identity of the company).
- External members: refused (`@DenyExternal`).
- Every mutation lands in the audit log (route → action map).
- The main entity cannot be deactivated; an entity still referenced is deactivated, never deleted.

## Performance

- No extra work on any hot path: the issuer is resolved once per invoice create/issue/read
  (one indexed lookup); lists carry only `legalEntityId` + a small `{id,label,prefix}` map fetched once.
- Number generation reads the last number by `startsWith` on the existing unique index.

## Phases

1. Server: shared rules + tests, schema + backfill migration, `LegalEntitiesService` (CRUD, bank
   accounts, main), invoice integration (resolve, number, snapshot, `issuer` on read), gateway routes.
2. Web: Settings › Companies, "Invoices issued by" on workspace and client, "Issued by" on the invoice
   (picker + document/PDF from `issuer`), invoices filter by company, employer on the member.
3. Documents: `{{org.*}}` / `{{company.*}}` merge fields from the member's employer entity.
4. HBC merge (operator, after the user's OK): keep HBC USA, add both companies, move HBC GmbH's
   clients — backup, dry run on a copy, then the real move.

## Status (2026-10-07)

- Phase 1 server — `8ffd871e`. Phase 2 web — `268f352c`. Phase 3 documents — `e051ce6c`. Phase 4 tool — this commit.
  **Nothing deployed.** E2E: `python3 tools/companies-e2e.py` (36 checks, LOCAL only; leaves one
  switched-off "HBC Test USA Inc." per run — delete it from the local DB).

## Phase 4 runbook — moving HBC GmbH into HBC USA (needs the user's OK)

`apps/api/auth-service/prisma/merge-org-into.js` — preview by default, `--apply` writes, one transaction,
re-runnable, refuses (lists by name) any client still referenced by the source org's jobs, assets,
reports, documents, portal logins or invitations.

1. Deploy phases 1–3 (migration `20261007200000_legal_entities` creates each org's main company).
2. In HBC USA › Settings › Companies: check the main company is "HBC USA Inc." (name, EIN, bank, USD,
   prefix e.g. `US`). In HBC GmbH › Settings › Companies: fill its details + bank (they are copied).
3. Backup: `pg_dump -U doergo doergo` → assert the table count.
4. Preview in the auth container:
   `docker exec hbcfield-auth-service node prisma/merge-org-into.js --from <HBC GmbH id> --into <HBC USA id> [--space <HBC USA workspace for them>]`
5. Resolve any blockers it lists, then the same command with `--apply`.
6. Check the clients in HBC USA (issued by HBC GmbH), set "Invoices issued by" on the workspaces,
   set each member's Employer; then suspend HBC GmbH on admin.hbcfield.com.
