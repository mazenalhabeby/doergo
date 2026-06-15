/**
 * Seeds the non-field-service task-type workflows (Logistics, Office, Sales,
 * Inspection), assigns two to spaces, and creates demo tasks assigned to Mike so
 * each type can be exercised on mobile. Idempotent (upserts / clears statuses).
 *
 * Run:  cd apps/api/auth-service && npx tsx prisma/seed-workflows.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type S = [string, string, string, string, number, boolean, boolean, string[]];
// name, key, color, icon, position, isFinal, isCanceled, transitions

const WORKFLOWS: { name: string; statuses: S[] }[] = [
  { name: 'Logistics', statuses: [
    ['Assigned',    'ASSIGNED',    '#64748b', 'checkmark', 0, false, false, ['ACCEPTED', 'CANCELED']],
    ['Accepted',    'ACCEPTED',    '#2563EB', 'checkmark', 1, false, false, ['PICKED_UP']],
    ['Picked up',   'PICKED_UP',   '#0891b2', 'cube',      2, false, false, ['IN_TRANSIT']],
    ['In transit',  'IN_TRANSIT',  '#2563EB', 'car',       3, false, false, ['DELIVERED']],
    ['Delivered',   'DELIVERED',   '#16A34A', 'checkmark', 4, true,  false, []],
  ]},
  { name: 'Office', statuses: [
    ['To-do', 'TODO',  '#64748b', 'list-outline', 0, false, false, ['DOING']],
    ['Doing', 'DOING', '#2563EB', 'construct',    1, false, false, ['DONE']],
    ['Done',  'DONE',  '#16A34A', 'checkmark',    2, true,  false, []],
  ]},
  { name: 'Sales', statuses: [
    ['Scheduled', 'SCHEDULED', '#64748b', 'calendar',      0, false, false, ['EN_ROUTE']],
    ['En route',  'EN_ROUTE',  '#2563EB', 'car',           1, false, false, ['VISITED']],
    ['Visited',   'VISITED',   '#0891b2', 'location',      2, false, false, ['OUTCOME']],
    ['Outcome',   'OUTCOME',   '#16A34A', 'document-text', 3, true,  false, []],
  ]},
  { name: 'Inspection', statuses: [
    ['Assigned',    'ASSIGNED',    '#64748b', 'checkmark',  0, false, false, ['IN_PROGRESS']],
    ['In progress', 'IN_PROGRESS', '#CA8A04', 'construct',  1, false, false, ['SUBMITTED']],
    ['Submitted',   'SUBMITTED',   '#16A34A', 'checkmark',  2, true,  false, []],
  ]},
];

async function main() {
  const org = await prisma.organization.findFirst();
  if (!org) throw new Error('No organization found');
  const orgId = org.id;
  const admin = await prisma.user.findFirst({ where: { email: 'client@example.com' } });
  const createdById = admin?.id;

  const wfId: Record<string, string> = {};
  for (const wf of WORKFLOWS) {
    const created = await prisma.statusWorkflow.upsert({
      where: { organizationId_name: { organizationId: orgId, name: wf.name } },
      update: { isActive: true },
      create: { organizationId: orgId, name: wf.name, isActive: true },
    });
    await prisma.workflowStatus.deleteMany({ where: { workflowId: created.id } });
    for (const [name, key, color, icon, position, isFinal, isCanceled, transitions] of wf.statuses) {
      await prisma.workflowStatus.create({
        data: { workflowId: created.id, name, key, color, icon, position, isFinal, isCanceled, transitions },
      });
    }
    wfId[wf.name] = created.id;
    console.log('✓ workflow', wf.name, `(${wf.statuses.length} statuses)`);
  }

  // Assign two workflows at the space level — tasks there inherit them.
  await prisma.companyLocation.updateMany({ where: { name: 'Warehouse' }, data: { workflowId: wfId['Logistics'] } });
  await prisma.companyLocation.updateMany({ where: { name: 'Service Center' }, data: { workflowId: wfId['Inspection'] } });
  console.log('✓ Warehouse → Logistics, Service Center → Inspection');

  // Demo tasks assigned to Mike so every type is testable on mobile.
  const demos: { title: string; wf: string; status: string; priority: any }[] = [
    { title: 'Deliver welcome kits — order #5102', wf: 'Logistics',  status: 'PICKED_UP',   priority: 'MEDIUM' },
    { title: 'Prepare Q3 board report',            wf: 'Office',     status: 'DOING',       priority: 'HIGH' },
    { title: 'Visit ACME Corp — renewal',          wf: 'Sales',      status: 'EN_ROUTE',    priority: 'MEDIUM' },
    { title: 'Monthly safety audit — Warehouse',   wf: 'Inspection', status: 'IN_PROGRESS', priority: 'HIGH' },
  ];
  for (const d of demos) {
    const existing = await prisma.task.findFirst({ where: { title: d.title, organizationId: orgId } });
    if (existing) {
      await prisma.task.update({ where: { id: existing.id }, data: { workflowId: wfId[d.wf], status: d.status, assignedToId: 'emp-mike' } });
    } else {
      await prisma.task.create({
        data: {
          title: d.title, status: d.status, priority: d.priority,
          organizationId: orgId, createdById, assignedToId: 'emp-mike', workflowId: wfId[d.wf],
          description: `Demo ${d.wf} task to exercise the ${d.wf} workflow on mobile.`,
        },
      });
    }
    console.log('✓ demo task:', d.title, `[${d.wf} · ${d.status}]`);
  }

  console.log('\nDone. Mike now has one task of each type.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
