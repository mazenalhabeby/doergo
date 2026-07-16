/**
 * Demo seed for the John Group org (john@johngroup.com).
 * Populates: spaces, many members across spaces, weekly schedules,
 * attendance (historical + currently clocked-in), and tasks — so the
 * Dashboard, Schedule and Attendance screens are full for screenshots.
 *
 * Re-runnable: uses deterministic ids + upserts.
 * Run from apps/api/auth-service:  npx tsx prisma/seed-johngroup.ts
 */
import { PrismaClient, Role, TaskStatus, TaskPriority, TimeEntryStatus, ApprovalStatus, TimeOffStatus } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()

const ADMIN_EMAIL = 'john@johngroup.com'

// Real, gender-matched portrait photos (randomuser.me — stable direct URLs).
const P = (g: 'men' | 'women', n: number) => `https://randomuser.me/api/portraits/${g}/${n}.jpg`
const AVATARS: Record<string, string> = {
  'jg-anna': P('women', 44), 'jg-thomas': P('men', 32),
  'jg-mike': P('men', 75), 'jg-sarah': P('women', 68), 'jg-lisa': P('women', 12), 'jg-noor': P('women', 33),
  'jg-karim': P('men', 41), 'jg-hassan': P('men', 60), 'jg-dana': P('women', 25), 'jg-omar': P('men', 22),
  'jg-david': P('men', 51), 'jg-elena': P('women', 57), 'jg-yusuf': P('men', 78), 'jg-marco': P('men', 15),
  'jg-pia': P('women', 9), 'jg-lukas': P('men', 64), 'jg-fatima': P('women', 85), 'jg-jonas': P('men', 3),
}

// ── helpers ────────────────────────────────────────────────────────────────
const HOUR = 3600_000
const DAY = 86400_000

/** Return the last `n` weekdays (Mon–Fri), most-recent first, as Date at 00:00. */
function lastWeekdays(n: number): Date[] {
  const out: Date[] = []
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  while (out.length < n) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) out.push(new Date(d))
    d.setTime(d.getTime() - DAY)
  }
  return out
}

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10)

  const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } })
  if (!admin?.organizationId) {
    console.error(`Admin ${ADMIN_EMAIL} not found or has no org.`)
    process.exit(1)
  }
  const orgId = admin.organizationId
  console.log(`Seeding John Group demo → org ${orgId}\n`)

  // ── SPACES ────────────────────────────────────────────────────────────────
  const spaceDefs = [
    { id: 'jg-space-head',    name: 'Head Office',    address: 'Arbeiterheimstraße 32, Laakirchen', lat: 47.9813, lng: 13.8269, geofenceRadius: 50, isDefault: true },
    { id: 'jg-space-north',   name: 'North Depot',    address: 'Industriestraße 12, Gmunden',        lat: 47.9186, lng: 13.7991, geofenceRadius: 80 },
    { id: 'jg-space-south',   name: 'South Depot',    address: 'Stadtplatz 8, Vöcklabruck',          lat: 48.0037, lng: 13.6577, geofenceRadius: 60 },
    { id: 'jg-space-service', name: 'Service Center', address: 'Tech Park 4, Vöcklabruck',           lat: 48.0102, lng: 13.6601, geofenceRadius: 40 },
  ]
  for (const s of spaceDefs) {
    await prisma.companyLocation.upsert({
      where: { id: s.id },
      update: { name: s.name, address: s.address, lat: s.lat, lng: s.lng, geofenceRadius: s.geofenceRadius, isActive: true },
      create: { ...s, organizationId: orgId, isActive: true },
    })
  }
  console.log(`✓ ${spaceDefs.length} spaces`)

  // ── MEMBERS ───────────────────────────────────────────────────────────────
  // scheduleType: FIXED = weekly schedule, FLEXIBLE = monthly hour budget, NONE = untracked
  type M = { id: string; first: string; last: string; role: Role; position: string; space: string; scheduleType: 'FIXED' | 'FLEXIBLE' | 'NONE'; budget?: number; active?: boolean }
  const members: M[] = [
    // Managers
    { id: 'jg-anna',    first: 'Anna',    last: 'Müller',   role: Role.EMPLOYEE,  position: 'Operations Manager',    space: 'jg-space-head',    scheduleType: 'FIXED',    active: true },
    { id: 'jg-thomas',  first: 'Thomas',  last: 'Bauer',    role: Role.EMPLOYEE,  position: 'Dispatch Manager',      space: 'jg-space-north',   scheduleType: 'FIXED',    active: true },
    // Head Office
    { id: 'jg-mike',    first: 'Mike',    last: 'Weber',    role: Role.EMPLOYEE, position: 'Field Technician',      space: 'jg-space-head',    scheduleType: 'FIXED',    active: true },
    { id: 'jg-sarah',   first: 'Sarah',   last: 'Wagner',   role: Role.EMPLOYEE, position: 'Service Engineer',      space: 'jg-space-head',    scheduleType: 'FIXED',    active: true },
    { id: 'jg-lisa',    first: 'Lisa',    last: 'Adler',    role: Role.EMPLOYEE, position: 'Electrician',           space: 'jg-space-head',    scheduleType: 'FIXED',    active: true },
    { id: 'jg-noor',    first: 'Noor',    last: 'Shah',     role: Role.EMPLOYEE, position: 'Plumber',               space: 'jg-space-head',    scheduleType: 'FLEXIBLE', budget: 160 },
    // North Depot
    { id: 'jg-karim',   first: 'Karim',   last: 'Ahmad',    role: Role.EMPLOYEE, position: 'HVAC Specialist',       space: 'jg-space-north',   scheduleType: 'FIXED',    active: true },
    { id: 'jg-hassan',  first: 'Hassan',  last: 'Berger',   role: Role.EMPLOYEE, position: 'Maintenance Worker',    space: 'jg-space-north',   scheduleType: 'FIXED',    active: true },
    { id: 'jg-dana',    first: 'Dana',    last: 'Pichler',  role: Role.EMPLOYEE, position: 'Logistics Coordinator', space: 'jg-space-north',   scheduleType: 'FIXED' },
    { id: 'jg-omar',    first: 'Omar',    last: 'Farag',    role: Role.EMPLOYEE, position: 'Driver',                space: 'jg-space-north',   scheduleType: 'FLEXIBLE', budget: 170 },
    // South Depot
    { id: 'jg-david',   first: 'David',   last: 'Koller',   role: Role.EMPLOYEE, position: 'Senior Technician',     space: 'jg-space-south',   scheduleType: 'FIXED',    active: true },
    { id: 'jg-elena',   first: 'Elena',   last: 'Novak',    role: Role.EMPLOYEE, position: 'Refrigeration Tech',    space: 'jg-space-south',   scheduleType: 'FIXED',    active: true },
    { id: 'jg-yusuf',   first: 'Yusuf',   last: 'Demir',    role: Role.EMPLOYEE, position: 'Installer',             space: 'jg-space-south',   scheduleType: 'FIXED' },
    { id: 'jg-marco',   first: 'Marco',   last: 'Rossi',    role: Role.EMPLOYEE, position: 'Solar Technician',      space: 'jg-space-south',   scheduleType: 'NONE' },
    // Service Center
    { id: 'jg-pia',     first: 'Pia',     last: 'Huber',    role: Role.EMPLOYEE, position: 'Service Engineer',      space: 'jg-space-service', scheduleType: 'FIXED',    active: true },
    { id: 'jg-lukas',   first: 'Lukas',   last: 'Gruber',   role: Role.EMPLOYEE, position: 'Locksmith',             space: 'jg-space-service', scheduleType: 'FIXED',    active: true },
    { id: 'jg-fatima',  first: 'Fatima',  last: 'Khan',     role: Role.EMPLOYEE, position: 'Painter',               space: 'jg-space-service', scheduleType: 'FLEXIBLE', budget: 150 },
    { id: 'jg-jonas',   first: 'Jonas',   last: 'Schmidt',  role: Role.EMPLOYEE, position: 'Carpenter',             space: 'jg-space-service', scheduleType: 'FIXED' },
  ]

  for (const m of members) {
    const isMgr = m.position.includes('Manager')
    await prisma.user.upsert({
      where: { email: `${m.id}@johngroup.com` },
      update: { position: m.position, scheduleType: m.scheduleType, monthlyHourBudget: m.budget ?? null, avatarUrl: AVATARS[m.id] },
      create: {
        id: m.id,
        email: `${m.id}@johngroup.com`,
        passwordHash,
        firstName: m.first,
        lastName: m.last,
        role: m.role,
        organization: { connect: { id: orgId } },
        onboardingCompleted: true,
        position: m.position,
        scheduleType: m.scheduleType,
        monthlyHourBudget: m.budget ?? null,
        avatarUrl: AVATARS[m.id],
        canViewAllTasks: isMgr,
        canAssignTasks: isMgr,
        taskCreationScope: isMgr ? 'SPACE' : 'NONE',
      },
    })
  }
  // Give the admin (and the pre-existing Mark) real avatars too
  await prisma.user.update({ where: { email: ADMIN_EMAIL }, data: { avatarUrl: P('men', 46) } })
  await prisma.user.updateMany({ where: { email: 'mark@johngroup.com' }, data: { avatarUrl: P('men', 29) } })
  console.log(`✓ ${members.length} members (with avatars)`)

  // ── SPACE ASSIGNMENTS ──────────────────────────────────────────────────────
  for (const m of members) {
    await prisma.technicianAssignment.upsert({
      where: { userId_locationId: { userId: m.id, locationId: m.space } },
      update: { isPrimary: true },
      create: { user: { connect: { id: m.id } }, location: { connect: { id: m.space } }, isPrimary: true, schedule: ['MON', 'TUE', 'WED', 'THU', 'FRI'] },
    })
  }
  // A few people also help out at a second space (multi-space membership)
  const crossSpace = [
    { userId: 'jg-mike',  locationId: 'jg-space-north' },
    { userId: 'jg-karim', locationId: 'jg-space-service' },
    { userId: 'jg-david', locationId: 'jg-space-head' },
  ]
  for (const a of crossSpace) {
    await prisma.technicianAssignment.upsert({
      where: { userId_locationId: a },
      update: {},
      create: { user: { connect: { id: a.userId } }, location: { connect: { id: a.locationId } }, isPrimary: false, schedule: ['MON', 'WED', 'FRI'] },
    })
  }
  console.log(`✓ ${members.length + crossSpace.length} space assignments`)

  // ── WEEKLY SCHEDULES (for FIXED members) → powers the Schedule page ─────────
  // Most work Mon–Fri; add variety: part-timers, early/late shifts, a remote day.
  let scheduleRows = 0
  for (const m of members) {
    if (m.scheduleType !== 'FIXED') continue
    // pick a shift pattern by a stable hash of the id
    const h = m.id.charCodeAt(3) + m.id.length
    const start = h % 3 === 0 ? '07:00' : h % 3 === 1 ? '08:00' : '09:00'
    const end = h % 3 === 0 ? '15:00' : h % 3 === 1 ? '16:00' : '17:00'
    const partTime = h % 5 === 0 // works Mon/Wed/Fri only
    const days = partTime ? [1, 3, 5] : [1, 2, 3, 4, 5]
    for (const dow of days) {
      const remote = dow === 5 && h % 4 === 0
      await prisma.technicianSchedule.upsert({
        where: { technicianId_dayOfWeek: { technicianId: m.id, dayOfWeek: dow } },
        update: { startTime: start, endTime: end, isActive: true, notes: remote ? 'Remote day' : null },
        create: { technician: { connect: { id: m.id } }, dayOfWeek: dow, startTime: start, endTime: end, isActive: true, notes: remote ? 'Remote day' : null },
      })
      scheduleRows++
    }
  }
  console.log(`✓ ${scheduleRows} weekly schedule entries`)

  // ── ATTENDANCE ─────────────────────────────────────────────────────────────
  const spaceCoord: Record<string, { lat: number; lng: number }> = Object.fromEntries(
    spaceDefs.map((s) => [s.id, { lat: s.lat, lng: s.lng }]),
  )
  const jitter = () => (Math.random() - 0.5) * 0.002
  const now = new Date()

  // Historical: last 8 weekdays, each active member clocked in ~08:00 and out ~16:30
  const days = lastWeekdays(8)
  let histCount = 0
  for (let mi = 0; mi < members.length; mi++) {
    const m = members[mi]!
    if (m.scheduleType === 'NONE') continue
    const c = spaceCoord[m.space]!
    for (let di = 0; di < days.length; di++) {
      // ~10% random absence for realism
      if ((mi + di) % 9 === 0) continue
      const day = days[di]!
      const inMin = 8 * 60 + ((mi * 7 + di * 3) % 25) // 08:00–08:24
      const workMin = 480 + ((mi + di) % 45) // ~8h + variance
      const clockInAt = new Date(day.getTime() + inMin * 60_000)
      const clockOutAt = new Date(clockInAt.getTime() + workMin * 60_000)
      const id = `jg-te-h-${mi}-${di}`
      await prisma.timeEntry.upsert({
        where: { id },
        update: { clockInAt, clockOutAt, totalMinutes: workMin },
        create: {
          id,
          user: { connect: { id: m.id } },
          location: { connect: { id: m.space } },
          organization: { connect: { id: orgId } },
          status: TimeEntryStatus.CLOCKED_OUT,
          clockInAt, clockOutAt, totalMinutes: workMin,
          clockInLat: c.lat + jitter(), clockInLng: c.lng + jitter(),
          clockOutLat: c.lat + jitter(), clockOutLng: c.lng + jitter(),
          clockInWithinGeofence: true, clockOutWithinGeofence: true,
          approvalStatus: ApprovalStatus.AUTO,
        },
      })
      histCount++
    }
  }
  console.log(`✓ ${histCount} historical attendance entries`)

  // Currently clocked in (real-time): members flagged active, in today ~1–4h ago
  const activeMembers = members.filter((m) => m.active)
  let activeCount = 0
  for (let i = 0; i < activeMembers.length; i++) {
    const m = activeMembers[i]!
    const c = spaceCoord[m.space]!
    const clockInAt = new Date(now.getTime() - (1 + (i % 4)) * HOUR - (i * 7) * 60_000)
    const id = `jg-te-active-${m.id}`
    await prisma.timeEntry.upsert({
      where: { id },
      update: { clockInAt, status: TimeEntryStatus.CLOCKED_IN, clockOutAt: null, totalMinutes: null },
      create: {
        id,
        user: { connect: { id: m.id } },
        location: { connect: { id: m.space } },
        organization: { connect: { id: orgId } },
        status: TimeEntryStatus.CLOCKED_IN,
        clockInAt,
        clockInLat: c.lat + jitter(), clockInLng: c.lng + jitter(),
        clockInWithinGeofence: true,
        approvalStatus: ApprovalStatus.AUTO,
      },
    })
    activeCount++
  }
  console.log(`✓ ${activeCount} members currently clocked in (real-time)`)

  // ── TASKS (fills the dashboard/board across spaces) ────────────────────────
  const d = (days: number) => new Date(now.getTime() + days * DAY)
  const S = TaskStatus, PR = TaskPriority
  const tasks = [
    { id: 'jg-t1',  title: 'HVAC System Maintenance',        status: S.IN_PROGRESS, priority: PR.HIGH,   assignedToId: 'jg-mike',   spaceId: 'jg-space-head',    due: d(1) },
    { id: 'jg-t2',  title: 'Office Network Cabling',         status: S.ASSIGNED,    priority: PR.MEDIUM, assignedToId: 'jg-lisa',   spaceId: 'jg-space-head',    due: d(3) },
    { id: 'jg-t3',  title: 'Kitchen Plumbing Repair',        status: S.NEW,         priority: PR.LOW,    assignedToId: null,        spaceId: 'jg-space-head',    due: d(5) },
    { id: 'jg-t4',  title: 'Fire Alarm Inspection',          status: S.COMPLETED,   priority: PR.URGENT, assignedToId: 'jg-sarah',  spaceId: 'jg-space-head',    due: d(-2) },
    { id: 'jg-t5',  title: 'Inventory Audit — Section B',    status: S.IN_PROGRESS, priority: PR.HIGH,   assignedToId: 'jg-hassan', spaceId: 'jg-space-north',   due: d(2) },
    { id: 'jg-t6',  title: 'Forklift Annual Service',        status: S.ASSIGNED,    priority: PR.URGENT, assignedToId: 'jg-dana',   spaceId: 'jg-space-north',   due: d(1) },
    { id: 'jg-t7',  title: 'Loading Dock Light Replacement', status: S.NEW,         priority: PR.MEDIUM, assignedToId: null,        spaceId: 'jg-space-north',   due: d(4) },
    { id: 'jg-t8',  title: 'Cold Room Compressor Check',     status: S.EN_ROUTE,    priority: PR.HIGH,   assignedToId: 'jg-elena',  spaceId: 'jg-space-south',   due: d(0) },
    { id: 'jg-t9',  title: 'Solar Panel Cleaning',           status: S.ASSIGNED,    priority: PR.LOW,    assignedToId: 'jg-marco',  spaceId: 'jg-space-south',   due: d(6) },
    { id: 'jg-t10', title: 'Generator Backup Test',          status: S.IN_PROGRESS, priority: PR.MEDIUM, assignedToId: 'jg-david',  spaceId: 'jg-space-south',   due: d(0) },
    { id: 'jg-t11', title: 'Electrical Panel Inspection',    status: S.ARRIVED,     priority: PR.URGENT, assignedToId: 'jg-pia',    spaceId: 'jg-space-service', due: d(1) },
    { id: 'jg-t12', title: 'Security Camera Installation',   status: S.ASSIGNED,    priority: PR.HIGH,   assignedToId: 'jg-lukas',  spaceId: 'jg-space-service', due: d(5) },
    { id: 'jg-t13', title: 'Repaint Reception Area',         status: S.BLOCKED,     priority: PR.LOW,    assignedToId: 'jg-fatima', spaceId: 'jg-space-service', due: d(7) },
    { id: 'jg-t14', title: 'Emergency Water Heater Repair',  status: S.NEW,         priority: PR.URGENT, assignedToId: null,        spaceId: 'jg-space-head',    due: d(0) },
  ]
  for (const t of tasks) {
    await prisma.task.upsert({
      where: { id: t.id },
      update: { status: t.status, priority: t.priority, dueDate: t.due },
      create: {
        id: t.id,
        title: t.title,
        description: `${t.title} — scheduled work order for John Group.`,
        status: t.status,
        priority: t.priority,
        dueDate: t.due,
        organization: { connect: { id: orgId } },
        createdBy: { connect: { id: admin.id } },
        space: { connect: { id: t.spaceId } },
        ...(t.assignedToId ? { assignedTo: { connect: { id: t.assignedToId } } } : {}),
      },
    })
  }
  console.log(`✓ ${tasks.length} tasks`)

  // ── TIME-OFF REQUESTS (enrich Schedule / availability + approvals) ──────────
  const day0 = new Date(); day0.setHours(0, 0, 0, 0)
  const toDate = (n: number) => new Date(day0.getTime() + n * DAY)
  const TO = TimeOffStatus
  const timeOff = [
    // Approved — including a couple who are OFF right now
    { id: 'jg-to-1', tech: 'jg-mike',   from: 7,  to: 11, reason: 'Vacation',   status: TO.APPROVED },
    { id: 'jg-to-2', tech: 'jg-omar',   from: -2, to: 3,  reason: 'Vacation',   status: TO.APPROVED },
    { id: 'jg-to-3', tech: 'jg-karim',  from: -1, to: 0,  reason: 'Sick leave', status: TO.APPROVED },
    { id: 'jg-to-4', tech: 'jg-david',  from: 21, to: 27, reason: 'Vacation',   status: TO.APPROVED },
    // Pending — show up in the approvals queue
    { id: 'jg-to-5', tech: 'jg-sarah',  from: 14, to: 16, reason: 'Personal',   status: TO.PENDING },
    { id: 'jg-to-6', tech: 'jg-elena',  from: 10, to: 10, reason: 'Personal',   status: TO.PENDING },
    { id: 'jg-to-7', tech: 'jg-lisa',   from: 30, to: 34, reason: 'Vacation',   status: TO.PENDING },
    { id: 'jg-to-8', tech: 'jg-pia',    from: 5,  to: 6,  reason: 'Sick leave', status: TO.PENDING },
    // Rejected
    { id: 'jg-to-9', tech: 'jg-fatima', from: 2,  to: 4,  reason: 'Personal',   status: TO.REJECTED, rejection: 'Coverage needed that week' },
  ]
  for (const to of timeOff) {
    const reviewed = to.status !== TO.PENDING
    await prisma.timeOff.upsert({
      where: { id: to.id },
      update: { startDate: toDate(to.from), endDate: toDate(to.to), status: to.status },
      create: {
        id: to.id,
        technician: { connect: { id: to.tech } },
        startDate: toDate(to.from),
        endDate: toDate(to.to),
        reason: to.reason,
        status: to.status,
        ...(reviewed ? { approvedBy: { connect: { id: admin.id } }, approvedAt: new Date() } : {}),
        ...(to.status === TO.REJECTED ? { rejectionReason: to.rejection } : {}),
      },
    })
  }
  console.log(`✓ ${timeOff.length} time-off requests`)

  // ── SUMMARY ────────────────────────────────────────────────────────────────
  const counts = {
    users: await prisma.user.count({ where: { organizationId: orgId } }),
    spaces: await prisma.companyLocation.count({ where: { organizationId: orgId } }),
    tasks: await prisma.task.count({ where: { organizationId: orgId } }),
    clockedIn: await prisma.timeEntry.count({ where: { organizationId: orgId, status: TimeEntryStatus.CLOCKED_IN } }),
    attendance: await prisma.timeEntry.count({ where: { organizationId: orgId } }),
    schedules: await prisma.technicianSchedule.count(),
    timeOff: await prisma.timeOff.count({ where: { technician: { organizationId: orgId } } }),
  }
  console.log(`\nDone. Org now has:`)
  console.log(`  ${counts.users} users`)
  console.log(`  ${counts.spaces} spaces`)
  console.log(`  ${counts.tasks} tasks`)
  console.log(`  ${counts.attendance} attendance entries (${counts.clockedIn} clocked in right now)`)
  console.log(`  ${counts.schedules} weekly schedule rows`)
  console.log(`  ${counts.timeOff} time-off requests`)
  console.log(`\nAll members log in with password123 (e.g. jg-mike@johngroup.com).`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
