/**
 * Fills Anna Müller's account (jg-anna@johngroup.com) with her own tasks
 * (assigned + created) and comments, so her personal views are full for
 * screenshots — not just the org-wide data she can already see.
 *
 * Re-runnable: deterministic ids + upserts.
 * Run from apps/api/auth-service:  npx tsx prisma/seed-anna.ts
 */
import { PrismaClient, TaskPriority } from '@prisma/client'

const prisma = new PrismaClient()
const DAY = 86400000

async function main() {
  const anna = await prisma.user.findUnique({ where: { email: 'jg-anna@johngroup.com' } })
  if (!anna) throw new Error('jg-anna@johngroup.com not found — run seed-johngroup.ts first')
  const orgId = anna.organizationId!
  const space = 'jg-space-head'
  const now = Date.now()
  const d = (n: number) => new Date(now + n * DAY)

  // Tasks assigned to Anna (fill her task list across the status flow) + created by her
  const tasks = [
    { id: 'jg-an1', title: 'Quarterly Safety Walkthrough',        status: 'IN_PROGRESS', priority: TaskPriority.HIGH,   due: d(0) },
    { id: 'jg-an2', title: 'New Client Onboarding — Site Survey', status: 'ASSIGNED',    priority: TaskPriority.MEDIUM, due: d(2) },
    { id: 'jg-an3', title: 'Monthly Equipment Audit',             status: 'EN_ROUTE',    priority: TaskPriority.HIGH,   due: d(0) },
    { id: 'jg-an4', title: 'Vendor Maintenance Coordination',     status: 'ACCEPTED',    priority: TaskPriority.MEDIUM, due: d(1) },
    { id: 'jg-an5', title: 'Staff Rota Review',                   status: 'COMPLETED',   priority: TaskPriority.LOW,    due: d(-1) },
    { id: 'jg-an6', title: 'HVAC Filter Replacement — Wing C',    status: 'ASSIGNED',    priority: TaskPriority.URGENT, due: d(1) },
    { id: 'jg-an7', title: 'Reception Signage Update',            status: 'ARRIVED',     priority: TaskPriority.LOW,    due: d(0) },
  ]
  for (const t of tasks) {
    await prisma.task.upsert({
      where: { id: t.id },
      update: { status: t.status, priority: t.priority, dueDate: t.due },
      create: {
        id: t.id,
        title: t.title,
        description: `${t.title} — Head Office, coordinated by Anna Müller.`,
        status: t.status,
        priority: t.priority,
        dueDate: t.due,
        organization: { connect: { id: orgId } },
        createdBy: { connect: { id: anna.id } },
        assignedTo: { connect: { id: anna.id } },
        space: { connect: { id: space } },
      },
    })
  }

  // Comments by Anna (activity on her tasks + a couple of team tasks)
  const comments = [
    { id: 'jg-anc1', taskId: 'jg-an1', content: 'Walkthrough underway — checking fire exits and PPE stations first.' },
    { id: 'jg-anc2', taskId: 'jg-an3', content: 'On my way to the audit site, ETA 20 minutes.' },
    { id: 'jg-anc3', taskId: 'jg-an2', content: 'Awaiting site access confirmation from the client.' },
    { id: 'jg-anc4', taskId: 'jg-t1',  content: 'Please prioritise the compressor before the AC units.' },
    { id: 'jg-anc5', taskId: 'jg-t2',  content: 'Cabling plan approved — go ahead.' },
  ]
  for (const c of comments) {
    await prisma.comment.upsert({
      where: { id: c.id },
      update: { content: c.content },
      create: {
        id: c.id,
        content: c.content,
        task: { connect: { id: c.taskId } },
        user: { connect: { id: anna.id } },
      },
    })
  }

  console.log(`✓ Anna populated: ${tasks.length} tasks (assigned + created), ${comments.length} comments`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
