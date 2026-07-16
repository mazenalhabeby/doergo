import { PrismaClient, Role, TaskStatus, TaskPriority, TaskEventType, AssetStatus, AttachmentType, ReportAttachmentType, TimeEntryStatus, InvitationStatus, JoinRequestStatus, JoinPolicy, CustomFieldType, RecurrenceFrequency } from '@prisma/client';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Clean existing data to make seed idempotent (order matters for FK constraints)
  console.log('Cleaning existing data...');
  await prisma.$executeRawUnsafe('DELETE FROM "breaks"');
  await prisma.$executeRawUnsafe('DELETE FROM "time_entries"');
  await prisma.$executeRawUnsafe('DELETE FROM "technician_assignments"');
  await prisma.locationHistory.deleteMany();
  await prisma.workerLastLocation.deleteMany();
  await prisma.partUsed.deleteMany();
  await prisma.reportAttachment.deleteMany();
  await prisma.serviceReport.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.taskEvent.deleteMany();
  await prisma.customFieldValue.deleteMany();
  await prisma.customFieldDefinition.deleteMany();
  await prisma.recurringTaskTemplate.deleteMany();
  await prisma.$executeRawUnsafe('DELETE FROM "workflow_statuses"');
  await prisma.$executeRawUnsafe('DELETE FROM "status_workflows"');
  await prisma.task.deleteMany();
  await prisma.technicianSchedule.deleteMany();
  await prisma.timeOff.deleteMany();
  await prisma.userPushToken.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.joinRequest.deleteMany();
  await prisma.companyLocation.deleteMany();
  await prisma.$executeRawUnsafe('DELETE FROM "assets"');
  await prisma.$executeRawUnsafe('DELETE FROM "asset_types"');
  await prisma.$executeRawUnsafe('DELETE FROM "asset_categories"');
  await prisma.user.deleteMany();
  await prisma.$executeRawUnsafe('DELETE FROM "org_roles"');
  await prisma.organizationAccess.deleteMany();
  await prisma.organization.deleteMany();

  // Helper to hash codes with SHA-256
  const hashCode = (code: string) => createHash('sha256').update(code).digest('hex');

  // Create organization (all users in same org for simpler testing)
  const organization = await prisma.organization.create({
    data: {
      name: 'Acme Corporation',
      joinCode: 'ACME2026',
      joinCodeHash: hashCode('ACME2026'),
      joinPolicy: JoinPolicy.OPEN,
    },
  });

  console.log('Created organization:', organization.name);

  // Hash password for all users
  const passwordHash = await bcrypt.hash('password123', 10);

  // Create Admin user (organization owner) - formerly CLIENT
  const clientUser = await prisma.user.create({
    data: {
      email: 'client@example.com',
      passwordHash,
      firstName: 'John',
      lastName: 'Owner',
      role: Role.ADMIN,
      organizationId: organization.id,
      onboardingCompleted: true,
      // ADMIN permissions - full access
      canCreateTasks: true,
      taskCreationScope: 'ORG',
      canViewAllTasks: true,
      canAssignTasks: true,
      canManageUsers: true,
      position: 'Office Manager',
      scheduleType: 'NONE',
    },
  });

  // Create Dispatcher user (manager)
  const dispatcherUser = await prisma.user.create({
    data: {
      email: 'dispatcher@example.com',
      passwordHash,
      firstName: 'Jane',
      lastName: 'Manager',
      role: Role.EMPLOYEE,
      organizationId: organization.id,
      onboardingCompleted: true,
      // DISPATCHER permissions - web only, can view all and assign
      canCreateTasks: false,
      taskCreationScope: 'SPACE',
      canViewAllTasks: true,
      canAssignTasks: true,
      canManageUsers: false,
      position: 'Operations Manager',
      scheduleType: 'FIXED',
    },
  });

  // Create Technician users (field workers)
  const technician1 = await prisma.user.create({
    data: {
      email: 'technician1@example.com',
      passwordHash,
      firstName: 'Mike',
      lastName: 'Worker',
      role: Role.EMPLOYEE,
      organizationId: organization.id,
      onboardingCompleted: true,
      // TECHNICIAN permissions - mobile only, execute tasks
      canCreateTasks: false,
      taskCreationScope: 'SELF',
      canViewAllTasks: false,
      canAssignTasks: false,
      canManageUsers: false,
      position: 'Field Technician',
      scheduleType: 'FIXED',
    },
  });

  const technician2 = await prisma.user.create({
    data: {
      email: 'technician2@example.com',
      passwordHash,
      firstName: 'Sarah',
      lastName: 'Worker',
      role: Role.EMPLOYEE,
      organizationId: organization.id,
      onboardingCompleted: true,
      // TECHNICIAN permissions - mobile only, execute tasks
      canCreateTasks: false,
      taskCreationScope: 'SELF',
      canViewAllTasks: false,
      canAssignTasks: false,
      canManageUsers: false,
      position: 'Driver',
      scheduleType: 'FLEXIBLE',
      monthlyHourBudget: 160,
    },
  });

  // Create Technician 3 — HYBRID (gets all 5 tabs: Home, Tasks, Clock, Time Off, Profile)
  const technician3 = await prisma.user.create({
    data: {
      email: 'technician3@example.com',
      passwordHash,
      firstName: 'Alex',
      lastName: 'Hybrid',
      role: Role.EMPLOYEE,
      organizationId: organization.id,
      onboardingCompleted: true,
      canCreateTasks: false,
      taskCreationScope: 'SELF',
      canViewAllTasks: false,
      canAssignTasks: false,
      canManageUsers: false,
      position: 'Service Engineer',
      scheduleType: 'FIXED',
    },
  });

  console.log('Created users:', clientUser.email, dispatcherUser.email, technician1.email, technician2.email, technician3.email);

  // ============================================
  // Create Organization Roles (custom role system)
  // ============================================

  const adminRole = await prisma.orgRole.create({
    data: {
      organizationId: organization.id,
      name: 'Administrator',
      slug: 'administrator',
      description: 'Full access to all features',
      color: '#2563eb',
      isSystem: true,
      legacyRole: 'ADMIN',
      position: 0,
      permissions: {
        canCreateTasks: true,
        canViewAllTasks: true,
        canAssignTasks: true,
        canDeleteTasks: true,
        canEditAnyTask: true,
        canManageUsers: true,
        canInviteUsers: true,
        canManageRoles: true,
        canViewAttendance: true,
        canApproveTimeOff: true,
        canApproveOvertime: true,
        canManageLocations: true,
        canManageWorkflows: true,
        canManageOrgSettings: true,
        taskCreationScope: 'ORG',
      },
    },
  });

  const managerRole = await prisma.orgRole.create({
    data: {
      organizationId: organization.id,
      name: 'Manager',
      slug: 'manager',
      description: 'Can manage tasks, team, and attendance',
      color: '#8b5cf6',
      isSystem: true,
      legacyRole: 'DISPATCHER',
      position: 1,
      permissions: {
        canCreateTasks: false,
        canViewAllTasks: true,
        canAssignTasks: true,
        canDeleteTasks: false,
        canEditAnyTask: true,
        canManageUsers: false,
        canInviteUsers: true,
        canManageRoles: false,
        canViewAttendance: true,
        canApproveTimeOff: true,
        canApproveOvertime: true,
        canManageLocations: false,
        canManageWorkflows: false,
        canManageOrgSettings: false,
        taskCreationScope: 'SPACE',
      },
    },
  });

  const employeeRole = await prisma.orgRole.create({
    data: {
      organizationId: organization.id,
      name: 'Employee',
      slug: 'employee',
      description: 'Can view and execute assigned tasks',
      color: '#10b981',
      isSystem: true,
      legacyRole: 'TECHNICIAN',
      position: 2,
      permissions: {
        canCreateTasks: false,
        canViewAllTasks: false,
        canAssignTasks: false,
        canDeleteTasks: false,
        canEditAnyTask: false,
        canManageUsers: false,
        canInviteUsers: false,
        canManageRoles: false,
        canViewAttendance: false,
        canApproveTimeOff: false,
        canApproveOvertime: false,
        canManageLocations: false,
        canManageWorkflows: false,
        canManageOrgSettings: false,
        taskCreationScope: 'SELF',
      },
    },
  });

  console.log('Created org roles:', adminRole.name, managerRole.name, employeeRole.name);

  // Assign roles to users
  await prisma.user.update({ where: { id: clientUser.id }, data: { orgRoleId: adminRole.id } });
  await prisma.user.update({ where: { id: dispatcherUser.id }, data: { orgRoleId: managerRole.id } });
  await prisma.user.update({ where: { id: technician1.id }, data: { orgRoleId: employeeRole.id } });
  await prisma.user.update({ where: { id: technician2.id }, data: { orgRoleId: employeeRole.id } });
  await prisma.user.update({ where: { id: technician3.id }, data: { orgRoleId: employeeRole.id } });

  console.log('Assigned org roles to all users');

  // ============================================
  // Create Company Locations for attendance tracking
  // ============================================

  // Note: enabledModules and workflowId are set after workflows are created (see below)
  const mainOffice = await prisma.companyLocation.create({
    data: {
      name: 'Main Office',
      address: 'Arbeiterheimstraße 35-39, 4662 Laakirchen, Austria',
      lat: 47.98188,
      lng: 13.82166,
      geofenceRadius: 200, // 200 meters
      organizationId: organization.id,
    },
  });

  const warehouse = await prisma.companyLocation.create({
    data: {
      name: 'Warehouse',
      address: 'Gmundner Straße 12, 4662 Laakirchen, Austria',
      lat: 47.9785,
      lng: 13.8245,
      geofenceRadius: 200,
      organizationId: organization.id,
    },
  });

  const serviceCenter = await prisma.companyLocation.create({
    data: {
      name: 'Service Center',
      address: 'Bahnhofstraße 5, 4663 Laakirchen, Austria',
      lat: 47.9830,
      lng: 13.8180,
      geofenceRadius: 200,
      organizationId: organization.id,
    },
  });

  console.log('Created company locations:', mainOffice.name, warehouse.name, serviceCenter.name);

  // ============================================
  // Create Technician Assignments (FULL_TIME only)
  // ============================================

  // Assign technician1 (FULL_TIME) to Main Office as primary location
  const assignment1 = await prisma.technicianAssignment.create({
    data: {
      userId: technician1.id,
      locationId: mainOffice.id,
      isPrimary: true,
      schedule: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    },
  });

  // Also assign technician1 to Warehouse for weekends
  const assignment2 = await prisma.technicianAssignment.create({
    data: {
      userId: technician1.id,
      locationId: warehouse.id,
      isPrimary: false,
      schedule: ['SAT', 'SUN'],
    },
  });

  // Also assign technician1 to Service Center
  const assignment3 = await prisma.technicianAssignment.create({
    data: {
      userId: technician1.id,
      locationId: serviceCenter.id,
      isPrimary: false,
      schedule: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    },
  });

  // Assign technician3 (HYBRID) to Main Office (needed for Clock tab)
  const assignment4 = await prisma.technicianAssignment.create({
    data: {
      userId: technician3.id,
      locationId: mainOffice.id,
      isPrimary: true,
      schedule: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    },
  });

  // Also assign technician3 to Service Center for flexibility
  const assignment5 = await prisma.technicianAssignment.create({
    data: {
      userId: technician3.id,
      locationId: serviceCenter.id,
      isPrimary: false,
      schedule: ['MON', 'WED', 'FRI'],
    },
  });

  // Note: technician2 is FREELANCER so they don't get assignments
  console.log('Created technician assignments:', assignment1.id, assignment2.id, assignment3.id, assignment4.id, assignment5.id);
  console.log('  - technician1 assigned to Main Office (primary, Mon-Fri), Warehouse (weekends), and Service Center (Mon-Fri)');
  console.log('  - technician2 is FREELANCER - no location assignments');
  console.log('  - technician3 assigned to Main Office (primary, Mon-Fri) and Service Center (Mon/Wed/Fri)');

  // ============================================
  // Create Time Entries (Clock-In/Clock-Out records)
  // ============================================

  // Yesterday's completed shift for technician1 (8am - 5pm = 9 hours)
  const yesterday8am = new Date();
  yesterday8am.setDate(yesterday8am.getDate() - 1);
  yesterday8am.setHours(8, 0, 0, 0);

  const yesterday5pm = new Date();
  yesterday5pm.setDate(yesterday5pm.getDate() - 1);
  yesterday5pm.setHours(17, 0, 0, 0);

  const yesterdayEntry = await prisma.timeEntry.create({
    data: {
      userId: technician1.id,
      locationId: mainOffice.id,
      status: TimeEntryStatus.CLOCKED_OUT,
      clockInAt: yesterday8am,
      clockInLat: 47.98188,
      clockInLng: 13.82166,
      clockInAccuracy: 10,
      clockInWithinGeofence: true,
      clockOutAt: yesterday5pm,
      clockOutLat: 47.98190,
      clockOutLng: 13.82170,
      clockOutAccuracy: 12,
      clockOutWithinGeofence: true,
      totalMinutes: 540, // 9 hours
      notes: 'Regular shift - completed scheduled work',
      organizationId: organization.id,
    },
  });

  // Day before yesterday shift for technician1 (Saturday at Warehouse)
  const twoDaysAgo8am = new Date();
  twoDaysAgo8am.setDate(twoDaysAgo8am.getDate() - 2);
  twoDaysAgo8am.setHours(8, 30, 0, 0);

  const twoDaysAgo4pm = new Date();
  twoDaysAgo4pm.setDate(twoDaysAgo4pm.getDate() - 2);
  twoDaysAgo4pm.setHours(16, 0, 0, 0);

  const weekendEntry = await prisma.timeEntry.create({
    data: {
      userId: technician1.id,
      locationId: warehouse.id,
      status: TimeEntryStatus.CLOCKED_OUT,
      clockInAt: twoDaysAgo8am,
      clockInLat: 47.9785,
      clockInLng: 13.8245,
      clockInAccuracy: 8,
      clockInWithinGeofence: true,
      clockOutAt: twoDaysAgo4pm,
      clockOutLat: 47.9786,
      clockOutLng: 13.8246,
      clockOutAccuracy: 15,
      clockOutWithinGeofence: true,
      totalMinutes: 450, // 7.5 hours
      organizationId: organization.id,
    },
  });

  // Current clocked-in entry for technician1 (started 2 hours ago)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const currentEntry = await prisma.timeEntry.create({
    data: {
      userId: technician1.id,
      locationId: mainOffice.id,
      status: TimeEntryStatus.CLOCKED_IN,
      clockInAt: twoHoursAgo,
      clockInLat: 47.98188,
      clockInLng: 13.82166,
      clockInAccuracy: 8,
      clockInWithinGeofence: true,
      organizationId: organization.id,
    },
  });

  // Yesterday's completed shift for technician3 (07:30 - 16:30 = 9 hours)
  const yesterday730 = new Date();
  yesterday730.setDate(yesterday730.getDate() - 1);
  yesterday730.setHours(7, 30, 0, 0);

  const yesterday1630 = new Date();
  yesterday1630.setDate(yesterday1630.getDate() - 1);
  yesterday1630.setHours(16, 30, 0, 0);

  const tech3YesterdayEntry = await prisma.timeEntry.create({
    data: {
      userId: technician3.id,
      locationId: mainOffice.id,
      status: TimeEntryStatus.CLOCKED_OUT,
      clockInAt: yesterday730,
      clockInLat: 47.98188,
      clockInLng: 13.82166,
      clockInAccuracy: 10,
      clockInWithinGeofence: true,
      clockOutAt: yesterday1630,
      clockOutLat: 47.98190,
      clockOutLng: 13.82170,
      clockOutAccuracy: 8,
      clockOutWithinGeofence: true,
      totalMinutes: 540, // 9 hours
      breakMinutes: 30,
      notes: 'Regular hybrid shift — field visits in afternoon',
      organizationId: organization.id,
    },
  });

  console.log('Created time entries:');
  console.log(`  - Yesterday's shift (${yesterdayEntry.totalMinutes} min) at Main Office (tech1)`);
  console.log(`  - Weekend shift (${weekendEntry.totalMinutes} min) at Warehouse (tech1)`);
  console.log(`  - Current active shift at Main Office (tech1, clocked in ${Math.round((Date.now() - twoHoursAgo.getTime()) / 60000)} min ago)`);
  console.log(`  - Yesterday's shift (${tech3YesterdayEntry.totalMinutes} min) at Main Office (tech3)`);

  // ============================================
  // Create Breaks for Time Entries
  // ============================================

  // Breaks for yesterday's entry
  const yesterdayLunchBreak = await prisma.break.create({
    data: {
      timeEntryId: yesterdayEntry.id,
      type: 'LUNCH',
      startedAt: new Date(yesterday8am.getTime() + 4 * 60 * 60 * 1000), // 4 hours after clock in (12pm)
      endedAt: new Date(yesterday8am.getTime() + 4.5 * 60 * 60 * 1000), // 30 min lunch
      durationMinutes: 30,
      notes: null,
    },
  });

  const yesterdayShortBreak = await prisma.break.create({
    data: {
      timeEntryId: yesterdayEntry.id,
      type: 'SHORT',
      startedAt: new Date(yesterday8am.getTime() + 2 * 60 * 60 * 1000), // 2 hours after clock in (10am)
      endedAt: new Date(yesterday8am.getTime() + 2.25 * 60 * 60 * 1000), // 15 min break
      durationMinutes: 15,
      notes: 'Coffee break',
    },
  });

  // Update yesterday entry's break minutes
  await prisma.timeEntry.update({
    where: { id: yesterdayEntry.id },
    data: { breakMinutes: 45 }, // 30 + 15
  });

  // Breaks for weekend entry
  const weekendLunchBreak = await prisma.break.create({
    data: {
      timeEntryId: weekendEntry.id,
      type: 'LUNCH',
      startedAt: new Date(twoDaysAgo8am.getTime() + 3.5 * 60 * 60 * 1000), // 11:30am
      endedAt: new Date(twoDaysAgo8am.getTime() + 4 * 60 * 60 * 1000), // 30 min
      durationMinutes: 30,
      notes: null,
    },
  });

  // Update weekend entry's break minutes
  await prisma.timeEntry.update({
    where: { id: weekendEntry.id },
    data: { breakMinutes: 30 },
  });

  // Break for current entry (technician took a short break earlier)
  const currentShortBreak = await prisma.break.create({
    data: {
      timeEntryId: currentEntry.id,
      type: 'SHORT',
      startedAt: new Date(twoHoursAgo.getTime() + 1 * 60 * 60 * 1000), // 1 hour after clock in
      endedAt: new Date(twoHoursAgo.getTime() + 1.17 * 60 * 60 * 1000), // ~10 min break
      durationMinutes: 10,
      notes: 'Quick coffee',
    },
  });

  // Update current entry's break minutes
  await prisma.timeEntry.update({
    where: { id: currentEntry.id },
    data: { breakMinutes: 10 },
  });

  console.log('Created breaks:');
  console.log(`  - Yesterday: ${yesterdayShortBreak.type} (${yesterdayShortBreak.durationMinutes}min) + ${yesterdayLunchBreak.type} (${yesterdayLunchBreak.durationMinutes}min)`);
  console.log(`  - Weekend: ${weekendLunchBreak.type} (${weekendLunchBreak.durationMinutes}min)`);
  console.log(`  - Current: ${currentShortBreak.type} (${currentShortBreak.durationMinutes}min)`);

  // ============================================
  // Create Asset Categories, Types, and Assets
  // ============================================

  // HVAC Category
  const hvacCategory = await prisma.assetCategory.create({
    data: {
      name: 'HVAC',
      description: 'Heating, ventilation, and air conditioning systems',
      icon: 'thermometer',
      color: '#3B82F6', // blue
      organizationId: organization.id,
    },
  });

  // Electrical Category
  const electricalCategory = await prisma.assetCategory.create({
    data: {
      name: 'Electrical',
      description: 'Electrical systems and components',
      icon: 'zap',
      color: '#F59E0B', // amber
      organizationId: organization.id,
    },
  });

  // Plumbing Category
  const plumbingCategory = await prisma.assetCategory.create({
    data: {
      name: 'Plumbing',
      description: 'Plumbing systems and fixtures',
      icon: 'droplet',
      color: '#06B6D4', // cyan
      organizationId: organization.id,
    },
  });

  console.log('Created asset categories:', hvacCategory.name, electricalCategory.name, plumbingCategory.name);

  // Asset Types for HVAC
  const acType = await prisma.assetType.create({
    data: {
      name: 'Air Conditioner',
      description: 'Central and split air conditioning units',
      categoryId: hvacCategory.id,
    },
  });

  const heaterType = await prisma.assetType.create({
    data: {
      name: 'Heater',
      description: 'Heating systems including furnaces and heat pumps',
      categoryId: hvacCategory.id,
    },
  });

  const ventilationType = await prisma.assetType.create({
    data: {
      name: 'Ventilation System',
      description: 'Air handling units and ventilation equipment',
      categoryId: hvacCategory.id,
    },
  });

  // Asset Types for Electrical
  const panelType = await prisma.assetType.create({
    data: {
      name: 'Electrical Panel',
      description: 'Main and sub-electrical panels',
      categoryId: electricalCategory.id,
    },
  });

  const generatorType = await prisma.assetType.create({
    data: {
      name: 'Generator',
      description: 'Backup and standby generators',
      categoryId: electricalCategory.id,
    },
  });

  // Asset Types for Plumbing
  const waterHeaterType = await prisma.assetType.create({
    data: {
      name: 'Water Heater',
      description: 'Tank and tankless water heaters',
      categoryId: plumbingCategory.id,
    },
  });

  const pumpType = await prisma.assetType.create({
    data: {
      name: 'Water Pump',
      description: 'Sump pumps and water circulation pumps',
      categoryId: plumbingCategory.id,
    },
  });

  console.log('Created asset types');

  // Create Assets
  const rooftopHVAC = await prisma.asset.create({
    data: {
      name: 'Rooftop HVAC Unit #1',
      serialNumber: 'AC-2024-001234',
      model: 'Carrier 50XC',
      manufacturer: 'Carrier',
      status: AssetStatus.ACTIVE,
      installDate: new Date('2024-03-15'),
      warrantyExpiry: new Date('2026-12-31'),
      locationAddress: 'Building A, Rooftop',
      locationLat: 40.7580,
      locationLng: -73.9855,
      notes: 'Primary cooling unit for floors 1-5. Regular quarterly maintenance required.',
      organizationId: organization.id,
      categoryId: hvacCategory.id,
      typeId: acType.id,
    },
  });

  const officeAC = await prisma.asset.create({
    data: {
      name: 'Office Split AC - Floor 3',
      serialNumber: 'AC-2023-005678',
      model: 'Daikin FTXM35',
      manufacturer: 'Daikin',
      status: AssetStatus.ACTIVE,
      installDate: new Date('2023-06-20'),
      warrantyExpiry: new Date('2025-06-20'),
      locationAddress: 'Building A, Floor 3, Server Room',
      locationLat: 40.7128,
      locationLng: -74.006,
      organizationId: organization.id,
      categoryId: hvacCategory.id,
      typeId: acType.id,
    },
  });

  const mainPanel = await prisma.asset.create({
    data: {
      name: 'Main Electrical Panel',
      serialNumber: 'EP-2022-001122',
      model: 'Square D QO342L400PG',
      manufacturer: 'Square D',
      status: AssetStatus.ACTIVE,
      installDate: new Date('2022-01-10'),
      warrantyExpiry: new Date('2024-01-10'), // Expired warranty
      locationAddress: 'Building A, Basement, Electrical Room',
      locationLat: 40.7128,
      locationLng: -74.006,
      notes: 'Main 400A panel. Annual inspection required.',
      organizationId: organization.id,
      categoryId: electricalCategory.id,
      typeId: panelType.id,
    },
  });

  const backupGenerator = await prisma.asset.create({
    data: {
      name: 'Backup Generator',
      serialNumber: 'GEN-2023-003344',
      model: 'Generac 22kW',
      manufacturer: 'Generac',
      status: AssetStatus.ACTIVE,
      installDate: new Date('2023-09-01'),
      warrantyExpiry: new Date('2028-09-01'),
      locationAddress: 'Building A, Exterior, Generator Pad',
      locationLat: 40.7128,
      locationLng: -74.006,
      notes: 'Automatic transfer switch. Monthly test runs required.',
      organizationId: organization.id,
      categoryId: electricalCategory.id,
      typeId: generatorType.id,
    },
  });

  const waterHeater = await prisma.asset.create({
    data: {
      name: 'Commercial Water Heater',
      serialNumber: 'WH-2024-007788',
      model: 'Rheem G100-200',
      manufacturer: 'Rheem',
      status: AssetStatus.MAINTENANCE,
      installDate: new Date('2024-02-15'),
      warrantyExpiry: new Date('2030-02-15'),
      locationAddress: 'Building A, Basement, Mechanical Room',
      locationLat: 40.7128,
      locationLng: -74.006,
      notes: 'Currently under maintenance - thermostat replacement in progress.',
      organizationId: organization.id,
      categoryId: plumbingCategory.id,
      typeId: waterHeaterType.id,
    },
  });

  console.log('Created assets:', rooftopHVAC.name, officeAC.name, mainPanel.name, backupGenerator.name, waterHeater.name);


  // ============================================
  // Create Tasks — comprehensive data covering all statuses
  // ============================================

  const now = new Date();
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60 * 1000);
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600 * 1000);
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400 * 1000);
  const hoursFromNow = (h: number) => new Date(now.getTime() + h * 3600 * 1000);
  const daysFromNow = (d: number) => new Date(now.getTime() + d * 86400 * 1000);

  // --- 1. DRAFT (no assignee, no due date, no location) ---
  const taskDraft = await prisma.task.create({
    data: {
      title: 'Plan Ventilation System Upgrade',
      description: 'Evaluate current ventilation system in Building A and propose upgrade options. Get quotes from at least two suppliers.',
      status: TaskStatus.DRAFT,
      priority: TaskPriority.LOW,
      organizationId: organization.id,
      createdById: clientUser.id,
      createdAt: daysAgo(5),
      updatedAt: daysAgo(5),
    },
  });

  // --- 2. NEW (unassigned, has due date + location) ---
  const taskNew = await prisma.task.create({
    data: {
      title: 'Replace Water Heater Thermostat',
      description: 'The thermostat on the commercial water heater is reading 10\u00B0F higher than actual temperature. Replace with OEM part.',
      status: TaskStatus.NEW,
      priority: TaskPriority.HIGH,
      organizationId: organization.id,
      createdById: clientUser.id,
      locationLat: 40.7128,
      locationLng: -74.006,
      locationAddress: 'Building A, Basement, Mechanical Room',
      assetId: waterHeater.id,
      dueDate: daysFromNow(1),
      createdAt: daysAgo(3),
      updatedAt: daysAgo(3),
    },
  });

  // --- 3. ASSIGNED (Mike) ---
  const taskAssigned = await prisma.task.create({
    data: {
      title: 'Electrical Panel Annual Inspection',
      description: 'Annual code-required inspection. Check all breakers, test GFCI outlets, verify grounding, and document findings.',
      status: TaskStatus.ASSIGNED,
      priority: TaskPriority.URGENT,
      organizationId: organization.id,
      createdById: clientUser.id,
      assignedToId: technician1.id,
      locationLat: 40.7128,
      locationLng: -74.006,
      locationAddress: 'Building A, Basement, Electrical Room',
      assetId: mainPanel.id,
      dueDate: daysFromNow(2),
      createdAt: daysAgo(2),
      updatedAt: daysAgo(1),
    },
  });

  // --- 4. ACCEPTED (Sarah) ---
  const taskAccepted = await prisma.task.create({
    data: {
      title: 'Office AC Coolant Recharge',
      description: 'Split AC on Floor 3 not cooling efficiently. Check refrigerant levels and recharge. Inspect for leaks.',
      status: TaskStatus.ACCEPTED,
      priority: TaskPriority.MEDIUM,
      organizationId: organization.id,
      createdById: clientUser.id,
      assignedToId: technician2.id,
      locationLat: 40.7128,
      locationLng: -74.006,
      locationAddress: 'Building A, Floor 3, Server Room',
      assetId: officeAC.id,
      dueDate: hoursFromNow(6),
      createdAt: hoursAgo(24),
      updatedAt: hoursAgo(18),
    },
  });

  // --- 5. EN_ROUTE (Sarah) — with live GPS route ---
  const enRouteStart = minutesAgo(20);
  const taskEnRoute = await prisma.task.create({
    data: {
      title: 'Emergency Water Leak Repair',
      description: 'Active water leak in 2nd floor ceiling. Tenant reports dripping near east wall. Likely burst pipe above ceiling tiles.',
      status: TaskStatus.EN_ROUTE,
      priority: TaskPriority.URGENT,
      organizationId: organization.id,
      createdById: clientUser.id,
      assignedToId: technician2.id,
      locationLat: 40.7484,
      locationLng: -73.9857,
      locationAddress: '350 5th Ave, New York, NY 10118',
      dueDate: hoursFromNow(1),
      routeStartedAt: enRouteStart,
      routeDistance: 1850,
      createdAt: hoursAgo(3),
      updatedAt: minutesAgo(20),
    },
  });

  // --- 6. ARRIVED (Mike) ---
  const arrivedRouteStart = hoursAgo(1);
  const arrivedRouteEnd = minutesAgo(30);
  const taskArrived = await prisma.task.create({
    data: {
      title: 'Server Room AC Diagnostic',
      description: 'Server room temperature above 78\u00B0F. AC running but not cooling. Could be compressor, refrigerant, or control board.',
      status: TaskStatus.ARRIVED,
      priority: TaskPriority.HIGH,
      organizationId: organization.id,
      createdById: clientUser.id,
      assignedToId: technician1.id,
      locationLat: 40.7128,
      locationLng: -74.006,
      locationAddress: 'Building A, Floor 3, Server Room',
      assetId: officeAC.id,
      dueDate: hoursFromNow(3),
      routeStartedAt: arrivedRouteStart,
      routeEndedAt: arrivedRouteEnd,
      routeDistance: 2100,
      createdAt: hoursAgo(4),
      updatedAt: minutesAgo(30),
    },
  });

  // --- 7. IN_PROGRESS (Mike) — key task for timer testing ---
  const inProgressStart = minutesAgo(45);
  const inProgressRouteStart = hoursAgo(2);
  const inProgressRouteEnd = minutesAgo(60);
  const taskInProgress = await prisma.task.create({
    data: {
      title: 'Rooftop HVAC Compressor Repair',
      description: 'Rooftop unit stopped cooling. Diagnostic indicates faulty compressor. Replace compressor, recharge refrigerant, and run full system test.',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      organizationId: organization.id,
      createdById: clientUser.id,
      assignedToId: technician1.id,
      locationLat: 40.7580,
      locationLng: -73.9855,
      locationAddress: 'Building A, Rooftop',
      assetId: rooftopHVAC.id,
      dueDate: hoursFromNow(2),
      routeStartedAt: inProgressRouteStart,
      routeEndedAt: inProgressRouteEnd,
      routeDistance: 3200,
      createdAt: hoursAgo(6),
      updatedAt: inProgressStart,
    },
  });

  // --- 8. BLOCKED (Mike) ---
  const taskBlocked = await prisma.task.create({
    data: {
      title: 'Backup Generator Oil Change',
      description: 'Scheduled oil change for backup generator. Includes filter replacement, fluid check, and 30-min test run.',
      status: TaskStatus.BLOCKED,
      priority: TaskPriority.MEDIUM,
      organizationId: organization.id,
      createdById: clientUser.id,
      assignedToId: technician1.id,
      locationLat: 40.7128,
      locationLng: -74.006,
      locationAddress: 'Building A, Exterior, Generator Pad',
      assetId: backupGenerator.id,
      dueDate: daysFromNow(3),
      createdAt: daysAgo(3),
      updatedAt: daysAgo(1),
    },
  });

  // --- 9. COMPLETED (Mike) — with route + service report ---
  const completedRouteStart = hoursAgo(5);
  const completedRouteEnd = hoursAgo(4.5);
  const taskCompleted = await prisma.task.create({
    data: {
      title: 'Fire Alarm System Test',
      description: 'Monthly fire alarm test. Test all pull stations, smoke detectors, and notification devices. Document any failures.',
      status: TaskStatus.COMPLETED,
      priority: TaskPriority.HIGH,
      organizationId: organization.id,
      createdById: clientUser.id,
      assignedToId: technician1.id,
      locationLat: 40.7589,
      locationLng: -73.9851,
      locationAddress: '456 Broadway, New York, NY 10013',
      dueDate: new Date(),
      routeStartedAt: completedRouteStart,
      routeEndedAt: completedRouteEnd,
      routeDistance: 4250,
      createdAt: hoursAgo(8),
      updatedAt: hoursAgo(2),
    },
  });

  // --- 10. COMPLETED older (Sarah) — with service report ---
  const taskCompleted2 = await prisma.task.create({
    data: {
      title: 'Plumbing Fixture Replacement',
      description: 'Replace leaking kitchen faucet and install new garbage disposal. Customer supplied replacement parts.',
      status: TaskStatus.COMPLETED,
      priority: TaskPriority.HIGH,
      organizationId: organization.id,
      createdById: clientUser.id,
      assignedToId: technician2.id,
      locationLat: 40.7484,
      locationLng: -73.9857,
      locationAddress: '789 Park Ave, New York, NY 10021',
      dueDate: daysAgo(3),
      createdAt: daysAgo(5),
      updatedAt: daysAgo(3),
    },
  });

  // --- 11. ASSIGNED to Sarah (today) ---
  const taskAssignedSarah = await prisma.task.create({
    data: {
      title: 'Water Pump Inspection',
      description: 'Inspect sump pump in basement. Check motor, float switch, and discharge pipe. Test backup battery if equipped.',
      status: TaskStatus.ASSIGNED,
      priority: TaskPriority.MEDIUM,
      organizationId: organization.id,
      createdById: clientUser.id,
      assignedToId: technician2.id,
      locationLat: 40.7128,
      locationLng: -74.006,
      locationAddress: 'Building A, Basement, Mechanical Room',
      assetId: waterHeater.id,
      dueDate: new Date(), // Due today
      createdAt: daysAgo(1),
      updatedAt: hoursAgo(4),
    },
  });

  // --- 12. ASSIGNED to technician3 (HYBRID) — due today, can accept & start ---
  const taskAssigned3 = await prisma.task.create({
    data: {
      title: 'Ventilation Filter Replacement',
      description: 'Replace all ventilation filters in Building A. Use MERV-13 filters. Check ductwork for debris.',
      status: TaskStatus.ASSIGNED,
      priority: TaskPriority.MEDIUM,
      organizationId: organization.id,
      createdById: clientUser.id,
      assignedToId: technician3.id,
      locationLat: 47.9830,
      locationLng: 13.8180,
      locationAddress: 'Bahnhofstraße 5, 4663 Laakirchen, Austria',
      assetId: rooftopHVAC.id,
      dueDate: new Date(), // Due today — can accept and start
      createdAt: daysAgo(1),
      updatedAt: hoursAgo(6),
    },
  });

  // --- 12. ASSIGNED to technician3 (HYBRID) — due tomorrow, can accept but not start ---
  const taskAssigned3Future = await prisma.task.create({
    data: {
      title: 'Generator Monthly Test Run',
      description: 'Perform scheduled monthly test run of backup generator. Run for 30 minutes under load. Check oil, coolant, and battery levels.',
      status: TaskStatus.ASSIGNED,
      priority: TaskPriority.LOW,
      organizationId: organization.id,
      createdById: clientUser.id,
      assignedToId: technician3.id,
      locationLat: 47.98188,
      locationLng: 13.82166,
      locationAddress: 'Arbeiterheimstraße 35-39, 4662 Laakirchen, Austria',
      assetId: backupGenerator.id,
      dueDate: daysFromNow(2), // Due in 2 days — can accept but cannot start
      createdAt: hoursAgo(12),
      updatedAt: hoursAgo(6),
    },
  });

  // --- 13. CANCELED ---
  const taskCanceled = await prisma.task.create({
    data: {
      title: 'Repaint Office Break Room',
      description: 'Repaint break room walls. Colors TBD by office manager.',
      status: TaskStatus.CANCELED,
      priority: TaskPriority.LOW,
      organizationId: organization.id,
      createdById: clientUser.id,
      locationLat: 40.7614,
      locationLng: -73.9776,
      locationAddress: '321 5th Ave, New York, NY 10016',
      createdAt: daysAgo(4),
      updatedAt: daysAgo(2),
    },
  });

  // --- 12. CLOSED ---
  const taskClosed = await prisma.task.create({
    data: {
      title: 'Quarterly Electrical Safety Audit',
      description: 'Q1 2026 electrical safety audit. Inspect all panels, test emergency lighting, check ground fault protection.',
      status: TaskStatus.CLOSED,
      priority: TaskPriority.MEDIUM,
      organizationId: organization.id,
      createdById: clientUser.id,
      assignedToId: technician1.id,
      locationLat: 40.7128,
      locationLng: -74.006,
      locationAddress: 'Building A, All Floors',
      assetId: mainPanel.id,
      createdAt: daysAgo(10),
      updatedAt: daysAgo(5),
    },
  });

  console.log('Created 15 tasks covering all statuses');

  // ============================================
  // Task Events — { oldStatus, newStatus } format matches real API
  // ============================================

  await prisma.taskEvent.createMany({
    data: [
      // DRAFT
      { taskId: taskDraft.id, userId: clientUser.id, eventType: TaskEventType.CREATED, metadata: { title: taskDraft.title }, createdAt: daysAgo(5) },

      // NEW
      { taskId: taskNew.id, userId: clientUser.id, eventType: TaskEventType.CREATED, metadata: { title: taskNew.title }, createdAt: daysAgo(3) },

      // ASSIGNED
      { taskId: taskAssigned.id, userId: clientUser.id, eventType: TaskEventType.CREATED, metadata: { title: taskAssigned.title }, createdAt: daysAgo(2) },
      { taskId: taskAssigned.id, userId: dispatcherUser.id, eventType: TaskEventType.ASSIGNED, metadata: { workerId: technician1.id, workerName: 'Mike Worker' }, createdAt: daysAgo(1) },

      // ACCEPTED
      { taskId: taskAccepted.id, userId: clientUser.id, eventType: TaskEventType.CREATED, metadata: { title: taskAccepted.title }, createdAt: hoursAgo(24) },
      { taskId: taskAccepted.id, userId: dispatcherUser.id, eventType: TaskEventType.ASSIGNED, metadata: { workerId: technician2.id, workerName: 'Sarah Worker' }, createdAt: hoursAgo(20) },
      { taskId: taskAccepted.id, userId: technician2.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.ASSIGNED, newStatus: TaskStatus.ACCEPTED }, createdAt: hoursAgo(18) },

      // EN_ROUTE
      { taskId: taskEnRoute.id, userId: clientUser.id, eventType: TaskEventType.CREATED, metadata: { title: taskEnRoute.title }, createdAt: hoursAgo(3) },
      { taskId: taskEnRoute.id, userId: dispatcherUser.id, eventType: TaskEventType.ASSIGNED, metadata: { workerId: technician2.id, workerName: 'Sarah Worker' }, createdAt: hoursAgo(2.5) },
      { taskId: taskEnRoute.id, userId: technician2.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.ASSIGNED, newStatus: TaskStatus.ACCEPTED }, createdAt: hoursAgo(2) },
      { taskId: taskEnRoute.id, userId: technician2.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.ACCEPTED, newStatus: TaskStatus.EN_ROUTE }, createdAt: enRouteStart },

      // ARRIVED
      { taskId: taskArrived.id, userId: clientUser.id, eventType: TaskEventType.CREATED, metadata: { title: taskArrived.title }, createdAt: hoursAgo(4) },
      { taskId: taskArrived.id, userId: dispatcherUser.id, eventType: TaskEventType.ASSIGNED, metadata: { workerId: technician1.id, workerName: 'Mike Worker' }, createdAt: hoursAgo(3.5) },
      { taskId: taskArrived.id, userId: technician1.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.ASSIGNED, newStatus: TaskStatus.ACCEPTED }, createdAt: hoursAgo(3) },
      { taskId: taskArrived.id, userId: technician1.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.ACCEPTED, newStatus: TaskStatus.EN_ROUTE }, createdAt: arrivedRouteStart },
      { taskId: taskArrived.id, userId: technician1.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.EN_ROUTE, newStatus: TaskStatus.ARRIVED }, createdAt: arrivedRouteEnd },

      // IN_PROGRESS (timer will seed from this event's createdAt)
      { taskId: taskInProgress.id, userId: clientUser.id, eventType: TaskEventType.CREATED, metadata: { title: taskInProgress.title }, createdAt: hoursAgo(6) },
      { taskId: taskInProgress.id, userId: dispatcherUser.id, eventType: TaskEventType.ASSIGNED, metadata: { workerId: technician1.id, workerName: 'Mike Worker' }, createdAt: hoursAgo(5) },
      { taskId: taskInProgress.id, userId: technician1.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.ASSIGNED, newStatus: TaskStatus.ACCEPTED }, createdAt: hoursAgo(4.5) },
      { taskId: taskInProgress.id, userId: technician1.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.ACCEPTED, newStatus: TaskStatus.EN_ROUTE }, createdAt: inProgressRouteStart },
      { taskId: taskInProgress.id, userId: technician1.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.EN_ROUTE, newStatus: TaskStatus.ARRIVED }, createdAt: inProgressRouteEnd },
      { taskId: taskInProgress.id, userId: technician1.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.ARRIVED, newStatus: TaskStatus.IN_PROGRESS }, createdAt: inProgressStart },

      // BLOCKED
      { taskId: taskBlocked.id, userId: clientUser.id, eventType: TaskEventType.CREATED, metadata: { title: taskBlocked.title }, createdAt: daysAgo(3) },
      { taskId: taskBlocked.id, userId: dispatcherUser.id, eventType: TaskEventType.ASSIGNED, metadata: { workerId: technician1.id, workerName: 'Mike Worker' }, createdAt: hoursAgo(60) },
      { taskId: taskBlocked.id, userId: technician1.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.ASSIGNED, newStatus: TaskStatus.ACCEPTED }, createdAt: hoursAgo(59) },
      { taskId: taskBlocked.id, userId: technician1.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.ACCEPTED, newStatus: TaskStatus.EN_ROUTE }, createdAt: daysAgo(2) },
      { taskId: taskBlocked.id, userId: technician1.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.EN_ROUTE, newStatus: TaskStatus.ARRIVED }, createdAt: hoursAgo(47) },
      { taskId: taskBlocked.id, userId: technician1.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.ARRIVED, newStatus: TaskStatus.IN_PROGRESS }, createdAt: hoursAgo(46) },
      { taskId: taskBlocked.id, userId: technician1.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.IN_PROGRESS, newStatus: TaskStatus.BLOCKED, reason: 'Oil filter part #GEN-OF-200 out of stock. Supplier ETA: 3 business days.' }, createdAt: daysAgo(1) },

      // COMPLETED (Mike)
      { taskId: taskCompleted.id, userId: clientUser.id, eventType: TaskEventType.CREATED, metadata: { title: taskCompleted.title }, createdAt: hoursAgo(8) },
      { taskId: taskCompleted.id, userId: dispatcherUser.id, eventType: TaskEventType.ASSIGNED, metadata: { workerId: technician1.id, workerName: 'Mike Worker' }, createdAt: hoursAgo(7) },
      { taskId: taskCompleted.id, userId: technician1.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.ASSIGNED, newStatus: TaskStatus.ACCEPTED }, createdAt: hoursAgo(6.5) },
      { taskId: taskCompleted.id, userId: technician1.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.ACCEPTED, newStatus: TaskStatus.EN_ROUTE }, createdAt: completedRouteStart },
      { taskId: taskCompleted.id, userId: technician1.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.EN_ROUTE, newStatus: TaskStatus.ARRIVED }, createdAt: completedRouteEnd },
      { taskId: taskCompleted.id, userId: technician1.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.ARRIVED, newStatus: TaskStatus.IN_PROGRESS }, createdAt: hoursAgo(4) },
      { taskId: taskCompleted.id, userId: technician1.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.IN_PROGRESS, newStatus: TaskStatus.COMPLETED }, createdAt: hoursAgo(2) },

      // COMPLETED older (Sarah)
      { taskId: taskCompleted2.id, userId: clientUser.id, eventType: TaskEventType.CREATED, metadata: { title: taskCompleted2.title }, createdAt: daysAgo(5) },
      { taskId: taskCompleted2.id, userId: dispatcherUser.id, eventType: TaskEventType.ASSIGNED, metadata: { workerId: technician2.id, workerName: 'Sarah Worker' }, createdAt: daysAgo(4) },
      { taskId: taskCompleted2.id, userId: technician2.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.ASSIGNED, newStatus: TaskStatus.ACCEPTED }, createdAt: hoursAgo(84) },
      { taskId: taskCompleted2.id, userId: technician2.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.ACCEPTED, newStatus: TaskStatus.EN_ROUTE }, createdAt: hoursAgo(80) },
      { taskId: taskCompleted2.id, userId: technician2.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.EN_ROUTE, newStatus: TaskStatus.ARRIVED }, createdAt: hoursAgo(77) },
      { taskId: taskCompleted2.id, userId: technician2.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.ARRIVED, newStatus: TaskStatus.IN_PROGRESS }, createdAt: hoursAgo(76) },
      { taskId: taskCompleted2.id, userId: technician2.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.IN_PROGRESS, newStatus: TaskStatus.COMPLETED }, createdAt: daysAgo(3) },

      // ASSIGNED to Sarah (today)
      { taskId: taskAssignedSarah.id, userId: clientUser.id, eventType: TaskEventType.CREATED, metadata: { title: taskAssignedSarah.title }, createdAt: daysAgo(1) },
      { taskId: taskAssignedSarah.id, userId: dispatcherUser.id, eventType: TaskEventType.ASSIGNED, metadata: { workerId: technician2.id, workerName: 'Sarah Worker' }, createdAt: hoursAgo(4) },

      // ASSIGNED to technician3 (today)
      { taskId: taskAssigned3.id, userId: clientUser.id, eventType: TaskEventType.CREATED, metadata: { title: taskAssigned3.title }, createdAt: daysAgo(1) },
      { taskId: taskAssigned3.id, userId: dispatcherUser.id, eventType: TaskEventType.ASSIGNED, metadata: { workerId: technician3.id, workerName: 'Alex Hybrid' }, createdAt: hoursAgo(6) },

      // ASSIGNED to technician3 (future)
      { taskId: taskAssigned3Future.id, userId: clientUser.id, eventType: TaskEventType.CREATED, metadata: { title: taskAssigned3Future.title }, createdAt: hoursAgo(12) },
      { taskId: taskAssigned3Future.id, userId: dispatcherUser.id, eventType: TaskEventType.ASSIGNED, metadata: { workerId: technician3.id, workerName: 'Alex Hybrid' }, createdAt: hoursAgo(6) },

      // CANCELED
      { taskId: taskCanceled.id, userId: clientUser.id, eventType: TaskEventType.CREATED, metadata: { title: taskCanceled.title }, createdAt: daysAgo(4) },
      { taskId: taskCanceled.id, userId: clientUser.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.NEW, newStatus: TaskStatus.CANCELED }, createdAt: daysAgo(2) },

      // CLOSED (full lifecycle)
      { taskId: taskClosed.id, userId: clientUser.id, eventType: TaskEventType.CREATED, metadata: { title: taskClosed.title }, createdAt: daysAgo(10) },
      { taskId: taskClosed.id, userId: dispatcherUser.id, eventType: TaskEventType.ASSIGNED, metadata: { workerId: technician1.id, workerName: 'Mike Worker' }, createdAt: daysAgo(9) },
      { taskId: taskClosed.id, userId: technician1.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.ASSIGNED, newStatus: TaskStatus.ACCEPTED }, createdAt: hoursAgo(204) },
      { taskId: taskClosed.id, userId: technician1.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.ACCEPTED, newStatus: TaskStatus.IN_PROGRESS }, createdAt: daysAgo(8) },
      { taskId: taskClosed.id, userId: technician1.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.IN_PROGRESS, newStatus: TaskStatus.COMPLETED }, createdAt: daysAgo(7) },
      { taskId: taskClosed.id, userId: clientUser.id, eventType: TaskEventType.STATUS_CHANGED, metadata: { oldStatus: TaskStatus.COMPLETED, newStatus: TaskStatus.CLOSED }, createdAt: daysAgo(5) },
    ],
  });

  console.log('Created task events');

  // ============================================
  // Comments — varied timestamps for formatTimeAgo() testing
  // ============================================

  await prisma.comment.createMany({
    data: [
      // NEW task
      { taskId: taskNew.id, userId: clientUser.id, content: 'Thermostat has been acting erratic for 2 weeks. Please prioritize.', createdAt: daysAgo(3) },

      // ASSIGNED task
      { taskId: taskAssigned.id, userId: dispatcherUser.id, content: 'Mike, please schedule this for early this week. Code inspection is mandatory.', createdAt: daysAgo(1) },

      // ACCEPTED task
      { taskId: taskAccepted.id, userId: dispatcherUser.id, content: 'Sarah, the server room is getting warm. Try to get there before noon.', createdAt: hoursAgo(19) },
      { taskId: taskAccepted.id, userId: technician2.id, content: 'Will head out after the current job. Should be there by 11.', createdAt: hoursAgo(18) },

      // EN_ROUTE task
      { taskId: taskEnRoute.id, userId: clientUser.id, content: 'This is urgent \u2014 water is actively leaking onto office equipment!', createdAt: hoursAgo(3) },
      { taskId: taskEnRoute.id, userId: technician2.id, content: 'On my way now. ETA 15 minutes.', createdAt: minutesAgo(20) },

      // ARRIVED task
      { taskId: taskArrived.id, userId: technician1.id, content: 'On site. Starting diagnostic now.', createdAt: minutesAgo(30) },

      // IN_PROGRESS task (varied timestamps for testing)
      { taskId: taskInProgress.id, userId: dispatcherUser.id, content: 'Customer is waiting. Please update when you have a diagnosis.', createdAt: hoursAgo(5) },
      { taskId: taskInProgress.id, userId: technician1.id, content: 'Arrived at rooftop. Compressor is definitely the issue \u2014 bearings are shot.', createdAt: hoursAgo(1) },
      { taskId: taskInProgress.id, userId: technician1.id, content: 'Old compressor removed. Installing replacement now.', createdAt: minutesAgo(20) },

      // BLOCKED task
      { taskId: taskBlocked.id, userId: technician1.id, content: 'Oil filter part #GEN-OF-200 is out of stock locally. Ordered from supplier \u2014 ETA 3 business days.', createdAt: daysAgo(1) },
      { taskId: taskBlocked.id, userId: dispatcherUser.id, content: 'Understood. I will update the customer. Resume when parts arrive.', createdAt: hoursAgo(20) },

      // COMPLETED task (throughout lifecycle)
      { taskId: taskCompleted.id, userId: dispatcherUser.id, content: 'Please test all floors, not just the first two.', createdAt: hoursAgo(7) },
      { taskId: taskCompleted.id, userId: technician1.id, content: 'Heading out now.', createdAt: hoursAgo(5) },
      { taskId: taskCompleted.id, userId: technician1.id, content: 'All pull stations and detectors on floors 1-5 tested. Two smoke detectors on floor 3 need battery replacement.', createdAt: hoursAgo(3) },
      { taskId: taskCompleted.id, userId: technician1.id, content: 'Replaced batteries. All systems green. Report submitted.', createdAt: hoursAgo(2) },

      // COMPLETED older task
      { taskId: taskCompleted2.id, userId: technician2.id, content: 'Faucet replaced and disposal installed. Running fine.', createdAt: daysAgo(3) },
      { taskId: taskCompleted2.id, userId: clientUser.id, content: 'Customer confirmed everything working. Good job!', createdAt: hoursAgo(60) },

      // CANCELED task
      { taskId: taskCanceled.id, userId: clientUser.id, content: 'Canceling \u2014 decided to hire a painting contractor instead.', createdAt: daysAgo(2) },
    ],
  });

  console.log('Created task comments');

  // ============================================
  // Worker Last Locations (for Live Map)
  // ============================================

  await prisma.workerLastLocation.createMany({
    data: [
      { userId: technician1.id, lat: 40.7580, lng: -73.9855, accuracy: 10 },
      { userId: technician2.id, lat: 40.7265, lng: -73.9915, accuracy: 8 },
      { userId: technician3.id, lat: 47.9820, lng: 13.8200, accuracy: 12 },
    ],
  });

  console.log('Created worker locations for Live Map');

  // ============================================
  // Route GPS Points
  // ============================================

  // EN_ROUTE task (Sarah) — live route in progress
  const enRoutePoints = [
    { lat: 40.7074, lng: -74.0113, m: 0 },
    { lat: 40.7095, lng: -74.0085, m: 2 },
    { lat: 40.7120, lng: -74.0055, m: 4 },
    { lat: 40.7148, lng: -74.0025, m: 6 },
    { lat: 40.7175, lng: -73.9998, m: 8 },
    { lat: 40.7205, lng: -73.9970, m: 10 },
    { lat: 40.7235, lng: -73.9942, m: 12 },
    { lat: 40.7265, lng: -73.9915, m: 14 },
  ];

  await prisma.locationHistory.createMany({
    data: enRoutePoints.map((p) => ({
      userId: technician2.id,
      taskId: taskEnRoute.id,
      lat: p.lat,
      lng: p.lng,
      accuracy: Math.floor(Math.random() * 8) + 5,
      timestamp: new Date(enRouteStart.getTime() + p.m * 60 * 1000),
    })),
  });

  // COMPLETED task (Mike) — full route: Chelsea to Midtown (~4.25 km)
  const completedRoutePoints = [
    { lat: 40.7433, lng: -74.0011, m: 0 },
    { lat: 40.7445, lng: -73.9995, m: 1 },
    { lat: 40.7458, lng: -73.9978, m: 2 },
    { lat: 40.7472, lng: -73.9962, m: 3 },
    { lat: 40.7485, lng: -73.9948, m: 4 },
    { lat: 40.7498, lng: -73.9935, m: 6 },
    { lat: 40.7502, lng: -73.9930, m: 8 },
    { lat: 40.7508, lng: -73.9922, m: 10 },
    { lat: 40.7520, lng: -73.9908, m: 12 },
    { lat: 40.7532, lng: -73.9895, m: 14 },
    { lat: 40.7545, lng: -73.9882, m: 16 },
    { lat: 40.7555, lng: -73.9872, m: 18 },
    { lat: 40.7562, lng: -73.9865, m: 20 },
    { lat: 40.7568, lng: -73.9860, m: 22 },
    { lat: 40.7572, lng: -73.9858, m: 25 },
    { lat: 40.7575, lng: -73.9856, m: 28 },
    { lat: 40.7578, lng: -73.9855, m: 30 },
    { lat: 40.7580, lng: -73.9855, m: 32 },
  ];

  await prisma.locationHistory.createMany({
    data: completedRoutePoints.map((p) => ({
      userId: technician1.id,
      taskId: taskCompleted.id,
      lat: p.lat,
      lng: p.lng,
      accuracy: Math.floor(Math.random() * 10) + 5,
      timestamp: new Date(completedRouteStart.getTime() + p.m * 60 * 1000),
    })),
  });

  console.log('Created GPS route points');

  // ============================================
  // Task Attachments (for image thumbnail testing)
  // ============================================

  await prisma.attachment.createMany({
    data: [
      // IN_PROGRESS task — 2 images + 1 document
      {
        taskId: taskInProgress.id,
        uploadedById: technician1.id,
        fileName: 'hvac_before_repair.jpg',
        fileUrl: 'https://placehold.co/800x600/dc2626/ffffff?text=Before+Repair',
        fileType: AttachmentType.IMAGE,
        fileSize: 245000,
      },
      {
        taskId: taskInProgress.id,
        uploadedById: technician1.id,
        fileName: 'compressor_damage.jpg',
        fileUrl: 'https://placehold.co/800x600/f59e0b/ffffff?text=Compressor+Damage',
        fileType: AttachmentType.IMAGE,
        fileSize: 312000,
      },
      {
        taskId: taskInProgress.id,
        uploadedById: dispatcherUser.id,
        fileName: 'work_order.pdf',
        fileUrl: 'https://placehold.co/800x400/3b82f6/ffffff?text=Work+Order',
        fileType: AttachmentType.DOCUMENT,
        fileSize: 156000,
      },
      // COMPLETED task — 1 image
      {
        taskId: taskCompleted.id,
        uploadedById: technician1.id,
        fileName: 'fire_alarm_panel.jpg',
        fileUrl: 'https://placehold.co/800x600/16a34a/ffffff?text=Alarm+Panel',
        fileType: AttachmentType.IMAGE,
        fileSize: 198000,
      },
    ],
  });

  console.log('Created task attachments');

  // ============================================
  // Service Reports (for completed + closed tasks)
  // ============================================

  // Report for Fire Alarm System Test (taskCompleted)
  const fireAlarmReport = await prisma.serviceReport.create({
    data: {
      taskId: taskCompleted.id,
      summary: 'Monthly fire alarm test completed. Two smoke detectors needed battery replacement.',
      workPerformed: `1. Tested all pull stations on floors 1-5
2. Tested all smoke detectors \u2014 found 2 dead batteries on floor 3
3. Replaced batteries in detectors #3-12 and #3-15
4. Tested all notification devices (horns and strobes)
5. Verified fire panel communication with monitoring station
6. All systems operational`,
      workDuration: 7200,
      technicianSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      customerSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
      customerName: 'Building Manager',
      completedAt: hoursAgo(2),
      completedById: technician1.id,
      organizationId: organization.id,
    },
  });

  await prisma.partUsed.createMany({
    data: [
      { reportId: fireAlarmReport.id, name: '9V Lithium Battery', partNumber: 'BAT-9V-LITH', quantity: 2, unitCost: 8.50, notes: 'For smoke detectors #3-12 and #3-15' },
    ],
  });

  await prisma.reportAttachment.createMany({
    data: [
      { reportId: fireAlarmReport.id, type: ReportAttachmentType.BEFORE, fileName: 'fire_panel_before.jpg', fileUrl: 'https://placehold.co/800x600/f59e0b/ffffff?text=Panel+Before', fileSize: 178000, caption: 'Fire alarm panel showing normal status' },
      { reportId: fireAlarmReport.id, type: ReportAttachmentType.AFTER, fileName: 'test_complete.jpg', fileUrl: 'https://placehold.co/800x600/16a34a/ffffff?text=Test+Complete', fileSize: 195000, caption: 'All systems tested and operational' },
    ],
  });

  // Report for Plumbing Fixture Replacement (taskCompleted2)
  const plumbingReport = await prisma.serviceReport.create({
    data: {
      taskId: taskCompleted2.id,
      summary: 'Replaced kitchen faucet and installed garbage disposal. All working properly.',
      workPerformed: `1. Shut off water supply
2. Removed old faucet and cleaned area
3. Installed new Moen kitchen faucet
4. Removed old drain assembly
5. Installed InSinkErator garbage disposal
6. Connected drain lines and tested for leaks
7. Restored water supply \u2014 no leaks detected`,
      workDuration: 5400,
      technicianSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      customerSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
      customerName: 'Sarah Johnson',
      completedAt: daysAgo(3),
      completedById: technician2.id,
      organizationId: organization.id,
    },
  });

  await prisma.partUsed.createMany({
    data: [
      { reportId: plumbingReport.id, name: 'Moen Align Kitchen Faucet', partNumber: 'MOE-5923-SRS', quantity: 1, unitCost: 189.00, notes: 'Customer supplied' },
      { reportId: plumbingReport.id, name: 'InSinkErator Disposal', partNumber: 'ISE-BADGER-5', quantity: 1, unitCost: 109.00, notes: 'Customer supplied' },
      { reportId: plumbingReport.id, name: 'Plumber Putty', partNumber: 'PLM-PUTY-14', quantity: 1, unitCost: 4.50 },
    ],
  });

  // Report for Quarterly Electrical Safety Audit (taskClosed)
  const auditReport = await prisma.serviceReport.create({
    data: {
      taskId: taskClosed.id,
      assetId: mainPanel.id,
      summary: 'Q1 2026 electrical safety audit passed. All systems within code requirements.',
      workPerformed: `1. Inspected main 400A panel \u2014 all breakers functional
2. Tested all GFCI outlets \u2014 all tripped correctly
3. Verified grounding continuity
4. Tested emergency lighting \u2014 3 units needed bulb replacement
5. Replaced emergency light bulbs
6. Thermal scan of panel \u2014 no hot spots detected
7. Documentation submitted to compliance office`,
      workDuration: 10800,
      technicianSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      customerSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
      customerName: 'John Owner',
      completedAt: daysAgo(7),
      completedById: technician1.id,
      organizationId: organization.id,
    },
  });

  await prisma.partUsed.createMany({
    data: [
      { reportId: auditReport.id, name: 'Emergency Light Bulb', partNumber: 'ELB-LED-6W', quantity: 3, unitCost: 12.00, notes: 'Replaced in stairwell units' },
    ],
  });

  console.log('Created 3 service reports with parts and attachments');

  // ============================================
  // Create Technician Schedules (Weekly)
  // ============================================

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Technician1 (Mike - FULL_TIME ON_SITE): Mon-Fri 09:00-17:00
  for (let day = 0; day < 7; day++) {
    await prisma.technicianSchedule.create({
      data: {
        technicianId: technician1.id,
        dayOfWeek: day,
        startTime: day >= 1 && day <= 5 ? '09:00' : '00:00',
        endTime: day >= 1 && day <= 5 ? '17:00' : '00:00',
        isActive: day >= 1 && day <= 5, // Mon-Fri active
        notes: day === 3 ? 'Remote day - available by phone' : day === 5 ? 'Early leave at 16:00 allowed' : null,
      },
    });
  }

  // Technician2 (Sarah - FREELANCER ON_ROAD): Mon-Sat 08:00-16:00
  for (let day = 0; day < 7; day++) {
    await prisma.technicianSchedule.create({
      data: {
        technicianId: technician2.id,
        dayOfWeek: day,
        startTime: day >= 1 && day <= 6 ? '08:00' : '00:00',
        endTime: day >= 1 && day <= 6 ? '16:00' : '00:00',
        isActive: day >= 1 && day <= 6, // Mon-Sat active
        notes: day === 6 ? 'Half day - until 12:00' : null,
      },
    });
  }

  // Technician3 (Alex - FULL_TIME HYBRID): Mon-Fri 07:30-16:30, Sat 08:00-12:00
  for (let day = 0; day < 7; day++) {
    const isWeekday = day >= 1 && day <= 5;
    const isSaturday = day === 6;
    await prisma.technicianSchedule.create({
      data: {
        technicianId: technician3.id,
        dayOfWeek: day,
        startTime: isWeekday ? '07:30' : isSaturday ? '08:00' : '00:00',
        endTime: isWeekday ? '16:30' : isSaturday ? '12:00' : '00:00',
        isActive: isWeekday || isSaturday, // Mon-Sat active
        notes: isSaturday ? 'Half day - on-site only' : null,
      },
    });
  }

  console.log('Created technician schedules (7 days each for 3 technicians)');

  // ============================================
  // Create Time-Off Requests
  // ============================================

  // Technician1: Approved vacation (upcoming)
  await prisma.timeOff.create({
    data: {
      technicianId: technician1.id,
      startDate: new Date('2026-04-15'),
      endDate: new Date('2026-04-17'),
      reason: 'Family vacation - will be out of town',
      status: 'APPROVED',
      approvedById: dispatcherUser.id,
      approvedAt: new Date('2026-03-28'),
    },
  });

  // Technician1: Pending request (waiting for approval)
  await prisma.timeOff.create({
    data: {
      technicianId: technician1.id,
      startDate: new Date('2026-05-01'),
      endDate: new Date('2026-05-02'),
      reason: 'Medical appointment',
      status: 'PENDING',
    },
  });

  // Technician1: Rejected request
  await prisma.timeOff.create({
    data: {
      technicianId: technician1.id,
      startDate: new Date('2026-06-10'),
      endDate: new Date('2026-06-14'),
      reason: 'Personal time off',
      status: 'REJECTED',
      approvedById: clientUser.id,
      approvedAt: new Date('2026-03-25'),
      rejectionReason: 'Insufficient coverage - 3 other techs already off this week',
    },
  });

  // Technician2: Approved vacation (upcoming)
  await prisma.timeOff.create({
    data: {
      technicianId: technician2.id,
      startDate: new Date('2026-05-20'),
      endDate: new Date('2026-05-24'),
      reason: 'Annual vacation',
      status: 'APPROVED',
      approvedById: dispatcherUser.id,
      approvedAt: new Date('2026-03-15'),
    },
  });

  // Technician2: Canceled request
  await prisma.timeOff.create({
    data: {
      technicianId: technician2.id,
      startDate: new Date('2026-04-01'),
      endDate: new Date('2026-04-01'),
      reason: 'Doctor visit',
      status: 'CANCELED',
    },
  });

  // Technician2: Pending request
  await prisma.timeOff.create({
    data: {
      technicianId: technician2.id,
      startDate: new Date('2026-04-28'),
      endDate: new Date('2026-04-29'),
      reason: 'Moving to new apartment',
      status: 'PENDING',
    },
  });

  // Technician3: Approved time off (upcoming)
  await prisma.timeOff.create({
    data: {
      technicianId: technician3.id,
      startDate: new Date('2026-04-21'),
      endDate: new Date('2026-04-22'),
      reason: 'Personal day',
      status: 'APPROVED',
      approvedById: clientUser.id,
      approvedAt: new Date('2026-03-30'),
    },
  });

  // Technician3: Pending request
  await prisma.timeOff.create({
    data: {
      technicianId: technician3.id,
      startDate: new Date('2026-05-12'),
      endDate: new Date('2026-05-14'),
      reason: 'Training course',
      status: 'PENDING',
    },
  });

  // ============================================
  // Create Sample Invitations
  // ============================================

  // Pending invitation for a technician
  await prisma.invitation.create({
    data: {
      codeHash: hashCode('TEST01'),
      targetRole: Role.EMPLOYEE,
      organizationId: organization.id,
      createdById: clientUser.id,
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000), // 3 days
      status: InvitationStatus.PENDING,
      // workMode removed
      specialty: 'Electrical',
      maxDailyJobs: 5,
    },
  });

  // Pending invitation for a dispatcher
  await prisma.invitation.create({
    data: {
      codeHash: hashCode('TEST02'),
      targetRole: Role.EMPLOYEE,
      organizationId: organization.id,
      createdById: clientUser.id,
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000), // 3 days
      status: InvitationStatus.PENDING,
    },
  });

  // Already used invitation
  await prisma.invitation.create({
    data: {
      codeHash: hashCode('USED01'),
      targetRole: Role.EMPLOYEE,
      organizationId: organization.id,
      createdById: clientUser.id,
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      status: InvitationStatus.ACCEPTED,
      usedAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Used 1 day ago
      acceptedById: technician1.id,
    },
  });

  console.log('Created sample invitations: TEST01 (technician), TEST02 (dispatcher), USED01 (accepted)');

  // ============================================
  // Create Orphan User (no organization - for onboarding flow testing)
  // ============================================

  const orphanUser = await prisma.user.create({
    data: {
      email: 'newuser@example.com',
      passwordHash,
      firstName: 'Chris',
      lastName: 'Newbie',
      role: Role.ADMIN, // Placeholder role - will be set during onboarding
      onboardingCompleted: false,
      // No organizationId - this user has not joined any org yet
    },
  });

  console.log('Created orphan user:', orphanUser.email, '(no organization, onboarding incomplete)');

  // ============================================
  // Create Pending Join Request from orphan user to Acme Corp
  // ============================================

  const joinRequest = await prisma.joinRequest.create({
    data: {
      userId: orphanUser.id,
      organizationId: organization.id,
      message: 'Hi, I would like to join your team!',
      status: JoinRequestStatus.PENDING,
    },
  });

  console.log('Created pending join request:', joinRequest.id, '(from orphan user to Acme Corp)');

  // ==================== CUSTOM STATUS WORKFLOWS ====================
  console.log('\nCreating default status workflow...');

  const defaultWorkflow = await prisma.statusWorkflow.create({
    data: {
      name: 'Default',
      isDefault: true,
      organizationId: organization.id,
    },
  });

  // Create statuses matching the existing TaskStatus enum
  const defaultStatuses = [
    { key: 'DRAFT', name: 'Draft', color: '#94a3b8', position: 0, isFinal: false, isCanceled: false, transitions: ['NEW'] },
    { key: 'NEW', name: 'New', color: '#3b82f6', position: 1, isFinal: false, isCanceled: false, transitions: ['ASSIGNED', 'CANCELED'] },
    { key: 'ASSIGNED', name: 'Assigned', color: '#8b5cf6', position: 2, isFinal: false, isCanceled: false, transitions: ['ACCEPTED', 'CANCELED'] },
    { key: 'ACCEPTED', name: 'Accepted', color: '#6366f1', position: 3, isFinal: false, isCanceled: false, transitions: ['EN_ROUTE', 'CANCELED'] },
    { key: 'EN_ROUTE', name: 'En Route', color: '#f59e0b', position: 4, isFinal: false, isCanceled: false, transitions: ['ARRIVED', 'CANCELED'] },
    { key: 'ARRIVED', name: 'Arrived', color: '#eab308', position: 5, isFinal: false, isCanceled: false, transitions: ['IN_PROGRESS', 'CANCELED'] },
    { key: 'IN_PROGRESS', name: 'In Progress', color: '#f97316', position: 6, isFinal: false, isCanceled: false, transitions: ['BLOCKED', 'COMPLETED', 'CANCELED'] },
    { key: 'BLOCKED', name: 'Blocked', color: '#ef4444', position: 7, isFinal: false, isCanceled: false, transitions: ['IN_PROGRESS', 'CANCELED'] },
    { key: 'COMPLETED', name: 'Completed', color: '#22c55e', position: 8, isFinal: true, isCanceled: false, transitions: ['CLOSED'] },
    { key: 'CANCELED', name: 'Canceled', color: '#64748b', position: 9, isFinal: false, isCanceled: true, transitions: [] },
    { key: 'CLOSED', name: 'Closed', color: '#94a3b8', position: 10, isFinal: true, isCanceled: false, transitions: [] },
  ];

  for (const status of defaultStatuses) {
    await prisma.workflowStatus.create({
      data: {
        workflowId: defaultWorkflow.id,
        ...status,
      },
    });
  }

  console.log('Created default workflow with', defaultStatuses.length, 'statuses');

  // Create a second "Logistics" workflow for variety
  const logisticsWorkflow = await prisma.statusWorkflow.create({
    data: {
      name: 'Logistics',
      isDefault: false,
      organizationId: organization.id,
    },
  });

  const logisticsStatuses = [
    { key: 'PENDING', name: 'Pending', color: '#94a3b8', position: 0, isFinal: false, isCanceled: false, transitions: ['PICKED_UP'] },
    { key: 'PICKED_UP', name: 'Picked Up', color: '#3b82f6', position: 1, isFinal: false, isCanceled: false, transitions: ['IN_TRANSIT', 'CANCELED'] },
    { key: 'IN_TRANSIT', name: 'In Transit', color: '#f59e0b', position: 2, isFinal: false, isCanceled: false, transitions: ['DELIVERED', 'FAILED', 'CANCELED'] },
    { key: 'DELIVERED', name: 'Delivered', color: '#22c55e', position: 3, isFinal: true, isCanceled: false, transitions: [] },
    { key: 'FAILED', name: 'Failed', color: '#ef4444', position: 4, isFinal: false, isCanceled: false, transitions: ['PICKED_UP', 'CANCELED'] },
    { key: 'CANCELED', name: 'Canceled', color: '#64748b', position: 5, isFinal: false, isCanceled: true, transitions: [] },
  ];

  for (const status of logisticsStatuses) {
    await prisma.workflowStatus.create({
      data: {
        workflowId: logisticsWorkflow.id,
        ...status,
      },
    });
  }

  console.log('Created Logistics workflow with', logisticsStatuses.length, 'statuses');

  // ==================== UPDATE SPACES WITH MODULES & WORKFLOWS ====================
  console.log('\nUpdating company locations with enabledModules and workflows...');

  await prisma.companyLocation.update({
    where: { id: mainOffice.id },
    data: {
      enabledModules: ['time_tracking'],
      workflowId: defaultWorkflow.id,
    },
  });

  await prisma.companyLocation.update({
    where: { id: warehouse.id },
    data: {
      enabledModules: ['time_tracking', 'sprints'],
      workflowId: defaultWorkflow.id,
    },
  });

  await prisma.companyLocation.update({
    where: { id: serviceCenter.id },
    data: {
      enabledModules: ['time_tracking', 'sprints', 'custom_fields'],
      workflowId: defaultWorkflow.id,
    },
  });

  console.log('Updated spaces with enabledModules and workflow associations');

  // ==================== CUSTOM FIELDS ====================
  console.log('\nCreating custom field definitions...');

  const customerPoField = await prisma.customFieldDefinition.create({
    data: {
      name: 'Customer PO Number',
      key: 'customer_po',
      type: CustomFieldType.TEXT,
      isRequired: false,
      position: 0,
      organizationId: organization.id,
    },
  });

  const urgencyField = await prisma.customFieldDefinition.create({
    data: {
      name: 'Urgency Level',
      key: 'urgency_level',
      type: CustomFieldType.DROPDOWN,
      options: ['Low', 'Normal', 'High', 'Critical'],
      isRequired: false,
      position: 1,
      organizationId: organization.id,
    },
  });

  const estimatedCostField = await prisma.customFieldDefinition.create({
    data: {
      name: 'Estimated Cost',
      key: 'estimated_cost',
      type: CustomFieldType.NUMBER,
      isRequired: false,
      position: 2,
      organizationId: organization.id,
    },
  });

  console.log('Created 3 custom field definitions');

  // ==================== RECURRING TASKS ====================
  console.log('\nCreating recurring task templates...');

  const weeklyInspection = await prisma.recurringTaskTemplate.create({
    data: {
      title: 'Weekly Equipment Inspection',
      description: 'Inspect all equipment in the main office building',
      priority: TaskPriority.MEDIUM,
      locationLat: 40.7128,
      locationLng: -74.006,
      locationAddress: '123 Business Ave, New York, NY',
      frequency: RecurrenceFrequency.WEEKLY,
      dayOfWeek: 1, // Monday
      startDate: new Date('2026-01-01'),
      nextRunAt: new Date('2026-05-12'), // next Monday
      isActive: true,
      checklist: [
        { text: 'Check HVAC systems' },
        { text: 'Inspect electrical panels' },
        { text: 'Test fire alarms' },
      ],
      organizationId: organization.id,
      createdById: clientUser.id,
    },
  });

  const monthlyMaintenance = await prisma.recurringTaskTemplate.create({
    data: {
      title: 'Monthly HVAC Maintenance',
      description: 'Full HVAC system maintenance check',
      priority: TaskPriority.HIGH,
      frequency: RecurrenceFrequency.MONTHLY,
      dayOfMonth: 15,
      startDate: new Date('2026-01-15'),
      nextRunAt: new Date('2026-05-15'),
      isActive: true,
      organizationId: organization.id,
      createdById: clientUser.id,
    },
  });

  console.log('Created 2 recurring task templates');

  console.log('\nSeed completed successfully!');
  console.log('\nTest credentials:');
  console.log('  Technician1: technician1@example.com / password123 (ON_SITE)');
  console.log('  Technician2: technician2@example.com / password123 (ON_ROAD)');
  console.log('  Technician3: technician3@example.com / password123 (HYBRID — all modules)');
  console.log('  New User:    newuser@example.com / password123 (NO org, onboarding incomplete)');
  console.log('\nOrg Join Code: ACME2026 (policy: OPEN)');
  console.log('Invitation Codes: TEST01 (technician), TEST02 (dispatcher)');
  console.log('\nTasks: 15 total covering all statuses');
  console.log('  Mike (tech1): ASSIGNED, ARRIVED, IN_PROGRESS, BLOCKED, COMPLETED, CLOSED');
  console.log('  Sarah (tech2): ASSIGNED, ACCEPTED, EN_ROUTE, COMPLETED');
  console.log('  Alex (tech3): 2x ASSIGNED (1 today, 1 future)');
  console.log('  Unassigned: DRAFT, NEW, CANCELED');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
