/**
 * Demo seed: creates realistic test data for the dashboard.
 * Run: npx tsx prisma/seed-demo.ts
 */
import { PrismaClient, Role, TaskStatus, TaskPriority } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10)

  // Find the admin's organization
  const admin = await prisma.user.findFirst({ where: { role: Role.ADMIN } })
  if (!admin?.organizationId) {
    console.error('No admin user found. Run the main seed first.')
    process.exit(1)
  }
  const orgId = admin.organizationId
  console.log(`Seeding demo data for org: ${orgId}\n`)

  // ═══ SPACES (Company Locations) ════════════════════════════════════════════

  const spaces = await Promise.all([
    prisma.companyLocation.upsert({
      where: { id: 'space-main' },
      update: {},
      create: { id: 'space-main', name: 'Main Office', address: 'Arbeiterheimstraße 32, Laakirchen', lat: 47.9813, lng: 13.8269, geofenceRadius: 50, organizationId: orgId, isActive: true },
    }),
    prisma.companyLocation.upsert({
      where: { id: 'space-warehouse' },
      update: {},
      create: { id: 'space-warehouse', name: 'Warehouse', address: '456 Industrial Blvd, Gmunden', lat: 47.9186, lng: 13.7991, geofenceRadius: 80, organizationId: orgId, isActive: true },
    }),
    prisma.companyLocation.upsert({
      where: { id: 'space-service' },
      update: {},
      create: { id: 'space-service', name: 'Service Center', address: '789 Tech Park, Vöcklabruck', lat: 48.0037, lng: 13.6577, geofenceRadius: 40, organizationId: orgId, isActive: true },
    }),
  ])
  console.log(`Created ${spaces.length} spaces`)

  // ═══ EMPLOYEES ═════════════════════════════════════════════════════════════

  const employees = [
    { id: 'emp-mike',   email: 'mike@example.com',   firstName: 'Mike',   lastName: 'Weber',    position: 'Field Technician' },
    { id: 'emp-sarah',  email: 'sarah@example.com',  firstName: 'Sarah',  lastName: 'Wagner',   position: 'Service Engineer' },
    { id: 'emp-karim',  email: 'karim@example.com',  firstName: 'Karim',  lastName: 'Ahmad',    position: 'HVAC Specialist' },
    { id: 'emp-lisa',   email: 'lisa@example.com',   firstName: 'Lisa',   lastName: 'Adler',    position: 'Electrician' },
    { id: 'emp-hassan', email: 'hassan@example.com', firstName: 'Hassan', lastName: 'Berger',   position: 'Maintenance Worker' },
    { id: 'emp-dana',   email: 'dana@example.com',   firstName: 'Dana',   lastName: 'Pichler',  position: 'Logistics Coordinator' },
    { id: 'emp-david',  email: 'david@example.com',  firstName: 'David',  lastName: 'Koller',   position: 'Senior Technician' },
    { id: 'emp-noor',   email: 'noor@example.com',   firstName: 'Noor',   lastName: 'Shah',     position: 'Plumber' },
  ]

  // Create a manager
  await prisma.user.upsert({
    where: { email: 'manager@example.com' },
    update: {},
    create: {
      id: 'emp-manager',
      email: 'manager@example.com',
      passwordHash,
      firstName: 'Anna',
      lastName: 'Müller',
      role: Role.EMPLOYEE,
      organization: { connect: { id: orgId } },
      onboardingCompleted: true,
      position: 'Operations Manager',
      canViewAllTasks: true,
      canAssignTasks: true,
      taskCreationScope: 'SPACE',
    },
  })

  for (const emp of employees) {
    await prisma.user.upsert({
      where: { email: emp.email },
      update: {},
      create: {
        id: emp.id,
        email: emp.email,
        passwordHash,
        firstName: emp.firstName,
        lastName: emp.lastName,
        role: Role.EMPLOYEE,
        organization: { connect: { id: orgId } },
        onboardingCompleted: true,
        position: emp.position,
      },
    })
  }
  console.log(`Created 1 manager + ${employees.length} employees`)

  // ═══ ASSIGN EMPLOYEES TO SPACES ════════════════════════════════════════════

  const assignments = [
    // Main Office
    { userId: 'emp-mike',   locationId: 'space-main' },
    { userId: 'emp-sarah',  locationId: 'space-main' },
    { userId: 'emp-lisa',   locationId: 'space-main' },
    { userId: 'emp-noor',   locationId: 'space-main' },
    // Warehouse
    { userId: 'emp-hassan', locationId: 'space-warehouse' },
    { userId: 'emp-dana',   locationId: 'space-warehouse' },
    // Service Center
    { userId: 'emp-karim',  locationId: 'space-service' },
    { userId: 'emp-david',  locationId: 'space-service' },
  ]

  for (const a of assignments) {
    await prisma.technicianAssignment.upsert({
      where: { userId_locationId: { userId: a.userId, locationId: a.locationId } },
      update: {},
      create: { user: { connect: { id: a.userId } }, location: { connect: { id: a.locationId } } },
    })
  }
  console.log(`Created ${assignments.length} space assignments`)

  // ═══ TASKS ═════════════════════════════════════════════════════════════════

  const now = new Date()
  const d = (days: number) => new Date(now.getTime() + days * 86400000).toISOString()

  const tasksData = [
    // Main Office tasks
    { title: 'HVAC System Maintenance',          desc: 'Annual HVAC inspection and filter replacement', status: TaskStatus.IN_PROGRESS, priority: TaskPriority.HIGH,   assignedToId: 'emp-mike',   spaceId: 'space-main',      dueDate: d(1),  locationAddress: 'Main Office, Floor 2' },
    { title: 'Office Network Cabling',           desc: 'Run Cat6 cables to new workstations',          status: TaskStatus.ASSIGNED,     priority: TaskPriority.MEDIUM, assignedToId: 'emp-lisa',   spaceId: 'space-main',      dueDate: d(3),  locationAddress: 'Main Office, Server Room' },
    { title: 'Plumbing Repair — Kitchen',        desc: 'Fix leaking faucet in kitchen area',           status: TaskStatus.NEW,          priority: TaskPriority.LOW,    assignedToId: null,         spaceId: 'space-main',      dueDate: d(5),  locationAddress: 'Main Office, Kitchen' },
    { title: 'Fire Alarm Inspection',            desc: 'Annual fire alarm system testing',              status: TaskStatus.COMPLETED,    priority: TaskPriority.URGENT, assignedToId: 'emp-sarah',  spaceId: 'space-main',      dueDate: d(-2), locationAddress: 'Main Office' },
    { title: 'Window Tinting — South Wing',      desc: 'Apply UV tint to south-facing windows',        status: TaskStatus.BLOCKED,      priority: TaskPriority.LOW,    assignedToId: 'emp-noor',   spaceId: 'space-main',      dueDate: d(7),  locationAddress: 'Main Office, South Wing' },
    // Warehouse tasks
    { title: 'Inventory Audit — Section B',      desc: 'Count and verify items in section B',          status: TaskStatus.IN_PROGRESS, priority: TaskPriority.HIGH,   assignedToId: 'emp-hassan', spaceId: 'space-warehouse', dueDate: d(2),  locationAddress: 'Warehouse, Section B' },
    { title: 'Forklift Annual Service',          desc: 'Oil change, brake check on forklift #3',       status: TaskStatus.ASSIGNED,     priority: TaskPriority.URGENT, assignedToId: 'emp-dana',   spaceId: 'space-warehouse', dueDate: d(1),  locationAddress: 'Warehouse, Dock A' },
    { title: 'Loading Dock Light Replacement',   desc: 'Replace 4 broken lights at dock B',            status: TaskStatus.NEW,          priority: TaskPriority.MEDIUM, assignedToId: null,         spaceId: 'space-warehouse', dueDate: d(4),  locationAddress: 'Warehouse, Dock B' },
    // Service Center tasks
    { title: 'Generator Backup Test',            desc: 'Monthly generator test run',                    status: TaskStatus.IN_PROGRESS, priority: TaskPriority.MEDIUM, assignedToId: 'emp-david',  spaceId: 'space-service',   dueDate: d(0),  locationAddress: 'Service Center, Generator Room' },
    { title: 'Electrical Panel Inspection',      desc: 'Quarterly safety inspection of main panel',     status: TaskStatus.EN_ROUTE,     priority: TaskPriority.URGENT, assignedToId: 'emp-karim',  spaceId: 'space-service',   dueDate: d(1),  locationAddress: 'Service Center' },
    { title: 'Security Camera Installation',     desc: 'Install 4 new cameras in parking area',        status: TaskStatus.ASSIGNED,     priority: TaskPriority.HIGH,   assignedToId: 'emp-karim',  spaceId: 'space-service',   dueDate: d(5),  locationAddress: 'Service Center, Parking' },
    // Unassigned tasks
    { title: 'Emergency Water Heater Repair',    desc: 'Water heater failure reported',                 status: TaskStatus.NEW,          priority: TaskPriority.URGENT, assignedToId: null,         spaceId: null,              dueDate: d(0),  locationAddress: 'Client Site — Gmunden' },
  ]

  for (const t of tasksData) {
    await prisma.task.create({
      data: {
        title: t.title,
        description: t.desc,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
        locationAddress: t.locationAddress,
        organization: { connect: { id: orgId } },
        createdBy: { connect: { id: admin.id } },
        ...(t.assignedToId ? { assignedTo: { connect: { id: t.assignedToId } } } : {}),
        ...(t.spaceId ? { space: { connect: { id: t.spaceId } } } : {}),
      },
    })
  }
  console.log(`Created ${tasksData.length} tasks`)

  // ═══ ATTENDANCE (today's clock-ins) ════════════════════════════════════════

  const todayStart = new Date()
  todayStart.setHours(7, 0, 0, 0)

  const clockIns = [
    { userId: 'emp-mike',   locationId: 'space-main',      hoursAgo: 3 },
    { userId: 'emp-sarah',  locationId: 'space-main',      hoursAgo: 4 },
    { userId: 'emp-lisa',   locationId: 'space-main',      hoursAgo: 2.5 },
    { userId: 'emp-hassan', locationId: 'space-warehouse', hoursAgo: 5 },
    { userId: 'emp-dana',   locationId: 'space-warehouse', hoursAgo: 3.5 },
    { userId: 'emp-karim',  locationId: 'space-service',   hoursAgo: 1 },
  ]

  for (const ci of clockIns) {
    const clockIn = new Date(now.getTime() - ci.hoursAgo * 3600000)
    await prisma.timeEntry.create({
      data: {
        user: { connect: { id: ci.userId } },
        location: { connect: { id: ci.locationId } },
        organization: { connect: { id: orgId } },
        clockInAt: clockIn,
        clockInLat: 47.98 + Math.random() * 0.01,
        clockInLng: 13.82 + Math.random() * 0.01,
        status: 'CLOCKED_IN',
      },
    })
  }
  console.log(`Created ${clockIns.length} attendance entries (today)`)

  // ═══ SUMMARY ══════════════════════════════════════════════════════════════

  const counts = {
    users: await prisma.user.count({ where: { organizationId: orgId } }),
    spaces: await prisma.companyLocation.count({ where: { organizationId: orgId } }),
    tasks: await prisma.task.count({ where: { organizationId: orgId } }),
    attendance: await prisma.timeEntry.count({ where: { organizationId: orgId } }),
    assignments: await prisma.technicianAssignment.count(),
  }

  console.log(`\nDone! Summary:`)
  console.log(`  ${counts.users} users (1 admin + 1 manager + 8 employees)`)
  console.log(`  ${counts.spaces} spaces`)
  console.log(`  ${counts.tasks} tasks`)
  console.log(`  ${counts.attendance} attendance entries`)
  console.log(`  ${counts.assignments} space assignments`)
  console.log(`\nCredentials (all use password123):`)
  console.log(`  Admin:   client@example.com`)
  console.log(`  Manager: manager@example.com`)
  console.log(`  Employee: mike@example.com (and 7 others)`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
