#!/usr/bin/env node
/**
 * MERGE ONE ORGANIZATION'S CLIENT BOOK INTO ANOTHER, AS A SEPARATE COMPANY
 * (docs/plans/companies-legal-entities.md, phase 4).
 *
 * Built for HBC: HBC USA Inc. stays the organization (people, workspaces, rota, history), HBC GmbH
 * becomes a COMPANY inside it, and HBC GmbH's clients move across — invoiced by HBC GmbH.
 *
 *   node prisma/merge-org-into.js --from <sourceOrgId> --into <targetOrgId> [--space <targetSpaceId>]
 *   node prisma/merge-org-into.js ... --apply
 *
 * ⚠️ PREVIEW BY DEFAULT. Without --apply it reads, prints the plan, and writes NOTHING.
 * ⚠️ ONE TRANSACTION. Every write, or none — a half-moved client book is worse than none moved.
 * ⚠️ IT REFUSES rather than guesses: a client still referenced by the source organization's jobs,
 *    assets, reports, documents, portal logins or invitations is a BLOCKER, listed by name. Moving
 *    it would leave a job in one organization pointing at a client in another. Decide those first.
 * ⚠️ RE-RUNNABLE. The company is matched by legal name; clients already moved are not in the
 *    source any more. A second run is a no-op that says so.
 * ⚠️ IT NEVER TOUCHES the source organization's people, workspaces or settings, and never
 *    suspends it — that is the operator's switch, after the result has been checked.
 *
 * Before --apply on production: a backup (`pg_dump -U doergo doergo`, assert the table count),
 * then a run against a restored copy.
 */
const { PrismaClient } = require('@prisma/client');

function args() {
  const a = process.argv.slice(2);
  const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  return { from: get('--from'), into: get('--into'), space: get('--space') ?? null, apply: a.includes('--apply') };
}

const COMPANY_FIELDS = [
  'legalName', 'label', 'addressLine1', 'addressLine2', 'postalCode', 'city', 'state', 'country', 'vatId',
  'taxId', 'registerNumber', 'email', 'phone', 'website', 'logoUrl', 'currency', 'invoicePrefix',
];
const BANK_FIELDS = ['label', 'holder', 'bankName', 'iban', 'bic', 'accountNumber', 'routingNumber', 'currency', 'isDefault', 'position'];
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k] ?? null]));

/** What still points at a client from outside its own record — each one blocks the move. */
async function blockers(db, sourceOrgId, ids) {
  if (!ids.length) return [];
  const where = { customerId: { in: ids } };
  const counts = await Promise.all([
    ['jobs', db.task.findMany({ where, select: { customerId: true } })],
    ['assets', db.asset.findMany({ where, select: { customerId: true } })],
    ['asset holders', db.assetHolder.findMany({ where, select: { customerId: true } })],
    ['asset custody', db.assetCustody.findMany({ where, select: { customerId: true } })],
    ['service reports', db.serviceReport.findMany({ where, select: { customerId: true } })],
    ['calendar events', db.calendarEvent.findMany({ where, select: { customerId: true } })],
    ['recurring jobs', db.recurringTaskTemplate.findMany({ where, select: { customerId: true } })],
    ['signing links', db.customerSignLink.findMany({ where, select: { customerId: true } })],
    ['document signatures', db.documentSignature.findMany({ where, select: { customerId: true } })],
    ['document signers', db.documentSigner.findMany({ where, select: { customerId: true } })],
    ['invitations', db.invitation.findMany({ where: { ...where, organizationId: sourceOrgId }, select: { customerId: true } })],
    ['portal logins', db.user.findMany({ where, select: { customerId: true } })],
    ['addresses with a resident login', db.customerUnit.findMany({ where: { ...where, residentUserId: { not: null } }, select: { customerId: true } })],
  ].map(async ([what, q]) => [what, await q]));
  const out = [];
  for (const [what, rows] of counts) {
    const byClient = new Map();
    for (const r of rows) byClient.set(r.customerId, (byClient.get(r.customerId) ?? 0) + 1);
    for (const [customerId, n] of byClient) out.push({ what, customerId, n });
  }
  return out;
}

async function main() {
  const { from, into, space, apply } = args();
  if (!from || !into) throw new Error('Usage: --from <sourceOrgId> --into <targetOrgId> [--space <targetSpaceId>] [--apply]');
  if (from === into) throw new Error('--from and --into are the same organization');
  const prisma = new PrismaClient();
  try {
    const [source, target] = await Promise.all([
      prisma.organization.findUnique({ where: { id: from }, select: { id: true, name: true } }),
      prisma.organization.findUnique({ where: { id: into }, select: { id: true, name: true } }),
    ]);
    if (!source) throw new Error(`No organization ${from}`);
    if (!target) throw new Error(`No organization ${into}`);
    if (space) {
      const s = await prisma.companyLocation.findFirst({ where: { id: space, organizationId: into }, select: { id: true, name: true, isActive: true } });
      if (!s) throw new Error(`Workspace ${space} is not in ${target.name}`);
      if (!s.isActive) throw new Error(`Workspace ${s.name} is archived`);
    }

    const sourceCompany = await prisma.legalEntity.findFirst({
      where: { organizationId: from, isMain: true },
      include: { bankAccounts: { orderBy: { position: 'asc' } } },
    });
    if (!sourceCompany) throw new Error(`${source.name} has no main company — run the legal_entities migration first`);
    const targetMain = await prisma.legalEntity.findFirst({ where: { organizationId: into, isMain: true }, select: { id: true, legalName: true } });
    if (!targetMain) throw new Error(`${target.name} has no main company — run the legal_entities migration first`);
    const existingCompany = await prisma.legalEntity.findFirst({
      where: { organizationId: into, legalName: sourceCompany.legalName },
      select: { id: true },
    });

    // People are matched by email: the same person with an account in both keeps their records.
    const [sourceUsers, targetUsers] = await Promise.all([
      prisma.user.findMany({ where: { organizationId: from }, select: { id: true, email: true } }),
      prisma.user.findMany({ where: { organizationId: into }, select: { id: true, email: true } }),
    ]);
    const byEmail = new Map(targetUsers.map((u) => [u.email.toLowerCase(), u.id]));
    const userMap = new Map(sourceUsers.map((u) => [u.id, byEmail.get(u.email.toLowerCase()) ?? null]));
    const mapUser = (id) => (id ? userMap.get(id) ?? null : null);

    const clients = await prisma.customer.findMany({
      where: { organizationId: from },
      select: { id: true, name: true, ownerId: true, managerIds: true, isPortalResident: true },
      orderBy: { name: 'asc' },
    });
    const ids = clients.map((c) => c.id);
    const blocking = await blockers(prisma, from, ids);
    const [contacts, activities, units] = await Promise.all([
      prisma.customerContact.count({ where: { organizationId: from } }),
      prisma.customerActivity.count({ where: { customerId: { in: ids } } }),
      prisma.customerUnit.count({ where: { customerId: { in: ids } } }),
    ]);
    const targetNames = new Set((await prisma.customer.findMany({ where: { organizationId: into }, select: { name: true } })).map((c) => c.name.trim().toLowerCase()));
    const sameName = clients.filter((c) => targetNames.has(c.name.trim().toLowerCase()));

    const name = (id) => clients.find((c) => c.id === id)?.name ?? id;
    console.log(`\n${apply ? 'APPLYING' : 'PREVIEW (nothing is written — add --apply)'}`);
    console.log(`  from:    ${source.name} (${from})`);
    console.log(`  into:    ${target.name} (${into}) — main company stays "${targetMain.legalName}"`);
    console.log(`  company: "${sourceCompany.legalName}" ${existingCompany ? 'already exists there — reused' : `created there, with ${sourceCompany.bankAccounts.length} bank account(s)`}`);
    console.log(`  clients: ${clients.length} (+ ${contacts} contact links, ${activities} notes/reminders, ${units} addresses)`);
    console.log(`  workspace for them: ${space ?? 'none (filed in no workspace — file them after)'}`);
    console.log(`  people matched by email: ${[...userMap.values()].filter(Boolean).length} of ${sourceUsers.length}`);
    if (sameName.length) console.log(`  ⚠ same name already in ${target.name} (moved anyway, both kept): ${sameName.map((c) => c.name).join(', ')}`);
    if (blocking.length) {
      console.log(`\n  ✗ BLOCKED — these clients are still referenced in ${source.name}:`);
      for (const b of blocking) console.log(`     - ${name(b.customerId)}: ${b.n} ${b.what}`);
      console.log('    Nothing was written. Resolve them (or move that work first) and run again.');
      process.exitCode = 2;
      return;
    }
    if (!clients.length) { console.log('\n  Nothing to move — already done?'); return; }
    if (!apply) { console.log('\n  OK to apply.'); return; }

    await prisma.$transaction(async (tx) => {
      let companyId = existingCompany?.id;
      if (!companyId) {
        const created = await tx.legalEntity.create({
          data: {
            ...pick(sourceCompany, COMPANY_FIELDS),
            invoicePrefix: sourceCompany.invoicePrefix || 'INV',
            organizationId: into, isMain: false, isActive: true,
            bankAccounts: { create: sourceCompany.bankAccounts.map((b) => ({ ...pick(b, BANK_FIELDS), organizationId: into })) },
          },
          select: { id: true },
        });
        companyId = created.id;
      }
      for (const c of clients) {
        await tx.customer.update({
          where: { id: c.id },
          data: {
            organizationId: into,
            legalEntityId: companyId,
            spaceId: space,
            portalId: null,
            isPortalResident: false,
            ownerId: mapUser(c.ownerId),
            managerIds: (c.managerIds ?? []).map(mapUser).filter(Boolean),
          },
        });
      }
      await tx.customerContact.updateMany({ where: { organizationId: from }, data: { organizationId: into } });
      await tx.customerUnit.updateMany({ where: { customerId: { in: ids } }, data: { organizationId: into, portalId: null, spaceId: space } });
      const acts = await tx.customerActivity.findMany({ where: { customerId: { in: ids } }, select: { id: true, authorId: true, reminderAssigneeId: true } });
      for (const a of acts) {
        await tx.customerActivity.update({
          where: { id: a.id },
          data: {
            organizationId: into,
            // An author with an account here is credited to it; one without keeps the old account (the record stays true).
            authorId: mapUser(a.authorId) ?? a.authorId,
            // A reminder must reach somebody who can still sign in here.
            reminderAssigneeId: mapUser(a.reminderAssigneeId),
          },
        });
      }
      const left = await tx.customer.count({ where: { organizationId: from } });
      if (left !== 0) throw new Error(`${left} clients still in the source — rolled back`);
    }, { timeout: 120_000, maxWait: 10_000 });

    console.log(`\n  ✓ Moved ${clients.length} clients into ${target.name}, issued by "${sourceCompany.legalName}".`);
    console.log(`  Next: check them in ${target.name}; then suspend ${source.name} on admin.hbcfield.com.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(`\n✗ ${e.message}`); process.exit(1); });
