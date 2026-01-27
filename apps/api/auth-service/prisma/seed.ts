import { PrismaClient, Role, TaskStatus, TaskPriority, TaskEventType, AssetStatus, ReportAttachmentType, TechnicianType, TimeEntryStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create organization (all users in same org for simpler testing)
  const organization = await prisma.organization.create({
    data: {
      name: 'Acme Corporation',
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
      // ADMIN permissions - full access
      platform: 'BOTH',
      canCreateTasks: true,
      canViewAllTasks: true,
      canAssignTasks: true,
      canManageUsers: true,
    },
  });

  // Create Dispatcher user (manager)
  const dispatcherUser = await prisma.user.create({
    data: {
      email: 'dispatcher@example.com',
      passwordHash,
      firstName: 'Jane',
      lastName: 'Manager',
      role: Role.DISPATCHER,
      organizationId: organization.id,
      // DISPATCHER permissions - web only, can view all and assign
      platform: 'WEB',
      canCreateTasks: false,
      canViewAllTasks: true,
      canAssignTasks: true,
      canManageUsers: false,
    },
  });

  // Create Technician users (field workers)
  const technician1 = await prisma.user.create({
    data: {
      email: 'technician1@example.com',
      passwordHash,
      firstName: 'Mike',
      lastName: 'Worker',
      role: Role.TECHNICIAN,
      organizationId: organization.id,
      // TECHNICIAN permissions - mobile only, execute tasks
      platform: 'MOBILE',
      canCreateTasks: false,
      canViewAllTasks: false,
      canAssignTasks: false,
      canManageUsers: false,
      // Full-time employee - assigned to company locations
      technicianType: TechnicianType.FULL_TIME,
    },
  });

  const technician2 = await prisma.user.create({
    data: {
      email: 'technician2@example.com',
      passwordHash,
      firstName: 'Sarah',
      lastName: 'Worker',
      role: Role.TECHNICIAN,
      organizationId: organization.id,
      // TECHNICIAN permissions - mobile only, execute tasks
      platform: 'MOBILE',
      canCreateTasks: false,
      canViewAllTasks: false,
      canAssignTasks: false,
      canManageUsers: false,
      // Freelancer - task-based work, no fixed location
      technicianType: TechnicianType.FREELANCER,
    },
  });

  console.log('Created users:', clientUser.email, dispatcherUser.email, technician1.email, technician2.email);

  // ============================================
  // Create Company Locations for attendance tracking
  // ============================================

  const mainOffice = await prisma.companyLocation.create({
    data: {
      name: 'Main Office',
      address: '123 Business Ave, New York, NY 10001',
      lat: 40.7128,
      lng: -74.0060,
      geofenceRadius: 20, // 20 meters for clock-in zone
      organizationId: organization.id,
    },
  });

  const warehouse = await prisma.companyLocation.create({
    data: {
      name: 'Warehouse',
      address: '456 Industrial Blvd, Brooklyn, NY 11201',
      lat: 40.6892,
      lng: -73.9857,
      geofenceRadius: 30, // Larger area for warehouse
      organizationId: organization.id,
    },
  });

  const serviceCenter = await prisma.companyLocation.create({
    data: {
      name: 'Service Center',
      address: '789 Tech Park, Jersey City, NJ 07302',
      lat: 40.7178,
      lng: -74.0431,
      geofenceRadius: 25,
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

  // Note: technician2 is FREELANCER so they don't get assignments
  console.log('Created technician assignments:', assignment1.id, assignment2.id);
  console.log('  - technician1 assigned to Main Office (primary, Mon-Fri) and Warehouse (weekends)');
  console.log('  - technician2 is FREELANCER - no location assignments');

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
      clockInLat: 40.7128,
      clockInLng: -74.0060,
      clockInAccuracy: 10,
      clockInWithinGeofence: true,
      clockOutAt: yesterday5pm,
      clockOutLat: 40.7128,
      clockOutLng: -74.0059,
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
      clockInLat: 40.6892,
      clockInLng: -73.9857,
      clockInAccuracy: 8,
      clockInWithinGeofence: true,
      clockOutAt: twoDaysAgo4pm,
      clockOutLat: 40.6893,
      clockOutLng: -73.9858,
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
      clockInLat: 40.7128,
      clockInLng: -74.0060,
      clockInAccuracy: 8,
      clockInWithinGeofence: true,
      organizationId: organization.id,
    },
  });

  console.log('Created time entries:');
  console.log(`  - Yesterday's shift (${yesterdayEntry.totalMinutes} min) at Main Office`);
  console.log(`  - Weekend shift (${weekendEntry.totalMinutes} min) at Warehouse`);
  console.log(`  - Current active shift at Main Office (clocked in ${Math.round((Date.now() - twoHoursAgo.getTime()) / 60000)} min ago)`);

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

  // Create sample tasks
  const tasks = await Promise.all([
    prisma.task.create({
      data: {
        title: 'Deliver package to downtown office',
        description: 'Urgent delivery of documents to the main office building',
        status: TaskStatus.NEW,
        priority: TaskPriority.HIGH,
        organizationId: organization.id,
        createdById: clientUser.id,
        locationLat: 40.7128,
        locationLng: -74.006,
        locationAddress: '123 Main St, New York, NY 10001',
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      },
    }),
    prisma.task.create({
      data: {
        title: 'Equipment installation',
        description: 'Install new equipment at client site',
        status: TaskStatus.ASSIGNED,
        priority: TaskPriority.MEDIUM,
        organizationId: organization.id,
        createdById: clientUser.id,
        assignedToId: technician1.id,
        locationLat: 40.7589,
        locationLng: -73.9851,
        locationAddress: '456 Broadway, New York, NY 10013',
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days
      },
    }),
    prisma.task.create({
      data: {
        title: 'Site inspection',
        description: 'Perform routine site inspection and report findings',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.LOW,
        organizationId: organization.id,
        createdById: clientUser.id,
        assignedToId: technician2.id,
        locationLat: 40.7484,
        locationLng: -73.9857,
        locationAddress: '789 Park Ave, New York, NY 10021',
        dueDate: new Date(),
      },
    }),
    prisma.task.create({
      data: {
        title: 'Maintenance check',
        description: 'Perform scheduled maintenance check on equipment',
        status: TaskStatus.DRAFT,
        priority: TaskPriority.MEDIUM,
        organizationId: organization.id,
        createdById: clientUser.id,
        locationLat: 40.7614,
        locationLng: -73.9776,
        locationAddress: '321 5th Ave, New York, NY 10016',
      },
    }),
  ]);

  console.log('Created', tasks.length, 'tasks');

  // Create task comments
  await prisma.comment.createMany({
    data: [
      {
        taskId: tasks[1].id,
        userId: dispatcherUser.id,
        content: 'Technician has been dispatched to the location.',
      },
      {
        taskId: tasks[2].id,
        userId: technician2.id,
        content: 'On site, beginning inspection now.',
      },
    ],
  });

  console.log('Created task comments');

  // Create task events
  await prisma.taskEvent.createMany({
    data: [
      {
        taskId: tasks[0].id,
        userId: clientUser.id,
        eventType: TaskEventType.CREATED,
        metadata: { title: tasks[0].title },
      },
      {
        taskId: tasks[1].id,
        userId: dispatcherUser.id,
        eventType: TaskEventType.ASSIGNED,
        metadata: { assignedToId: technician1.id },
      },
      {
        taskId: tasks[2].id,
        userId: technician2.id,
        eventType: TaskEventType.STATUS_CHANGED,
        metadata: { from: TaskStatus.ASSIGNED, to: TaskStatus.IN_PROGRESS },
      },
    ],
  });

  console.log('Created task events');

  // Create worker last locations for technicians (for Live Map testing)
  await prisma.workerLastLocation.createMany({
    data: [
      {
        userId: technician1.id,
        lat: 40.7128,  // Near task location in NYC
        lng: -74.006,
        accuracy: 10,
      },
      {
        userId: technician2.id,
        lat: 40.7589,  // Different location in NYC
        lng: -73.9851,
        accuracy: 15,
      },
    ],
  });

  console.log('Created worker locations for Live Map');

  // Create a task with FULL route tracking data for testing the route map feature
  const routeStartTime = new Date(Date.now() - 45 * 60 * 1000); // Started 45 minutes ago
  const routeEndTime = new Date(Date.now() - 10 * 60 * 1000); // Ended 10 minutes ago

  const completedTaskWithRoute = await prisma.task.create({
    data: {
      title: 'HVAC System Repair - Completed with Route',
      description: 'Emergency HVAC repair at client location. Full route tracking available.',
      status: TaskStatus.COMPLETED,
      priority: TaskPriority.HIGH,
      organizationId: organization.id,
      createdById: clientUser.id,
      assignedToId: technician1.id,
      locationLat: 40.7580,
      locationLng: -73.9855,
      locationAddress: 'Times Square, New York, NY 10036',
      dueDate: new Date(),
      routeStartedAt: routeStartTime,
      routeEndedAt: routeEndTime,
      routeDistance: 4250, // 4.25 km in meters
      assetId: rooftopHVAC.id, // Link to the rooftop HVAC asset
    },
  });

  console.log('Created completed task with route:', completedTaskWithRoute.title);

  // Create realistic GPS route points (simulating a drive through Manhattan)
  // Route: From Chelsea to Times Square (~4.25 km)
  const routePoints = [
    // Starting point - Chelsea
    { lat: 40.7433, lng: -74.0011, minutesFromStart: 0 },
    { lat: 40.7445, lng: -73.9995, minutesFromStart: 1 },
    { lat: 40.7458, lng: -73.9978, minutesFromStart: 2 },
    // Heading north on 7th Ave
    { lat: 40.7472, lng: -73.9962, minutesFromStart: 3 },
    { lat: 40.7485, lng: -73.9948, minutesFromStart: 4 },
    { lat: 40.7498, lng: -73.9935, minutesFromStart: 6 },
    // Traffic slowdown
    { lat: 40.7502, lng: -73.9930, minutesFromStart: 8 },
    { lat: 40.7508, lng: -73.9922, minutesFromStart: 10 },
    // Continuing north
    { lat: 40.7520, lng: -73.9908, minutesFromStart: 12 },
    { lat: 40.7532, lng: -73.9895, minutesFromStart: 14 },
    { lat: 40.7545, lng: -73.9882, minutesFromStart: 16 },
    // Approaching Times Square
    { lat: 40.7555, lng: -73.9872, minutesFromStart: 18 },
    { lat: 40.7562, lng: -73.9865, minutesFromStart: 20 },
    { lat: 40.7568, lng: -73.9860, minutesFromStart: 22 },
    // Final approach
    { lat: 40.7572, lng: -73.9858, minutesFromStart: 25 },
    { lat: 40.7575, lng: -73.9856, minutesFromStart: 28 },
    { lat: 40.7578, lng: -73.9855, minutesFromStart: 30 },
    // Arrived at Times Square
    { lat: 40.7580, lng: -73.9855, minutesFromStart: 32 },
  ];

  // Create LocationHistory records for the route
  await prisma.locationHistory.createMany({
    data: routePoints.map((point) => ({
      userId: technician1.id,
      taskId: completedTaskWithRoute.id,
      lat: point.lat,
      lng: point.lng,
      accuracy: Math.floor(Math.random() * 10) + 5, // 5-15 meters accuracy
      timestamp: new Date(routeStartTime.getTime() + point.minutesFromStart * 60 * 1000),
    })),
  });

  console.log('Created', routePoints.length, 'GPS route points for route tracking');

  // Create task events for the completed task
  await prisma.taskEvent.createMany({
    data: [
      {
        taskId: completedTaskWithRoute.id,
        userId: clientUser.id,
        eventType: TaskEventType.CREATED,
        metadata: { title: completedTaskWithRoute.title },
        createdAt: new Date(Date.now() - 120 * 60 * 1000), // 2 hours ago
      },
      {
        taskId: completedTaskWithRoute.id,
        userId: dispatcherUser.id,
        eventType: TaskEventType.ASSIGNED,
        metadata: { assignedToId: technician1.id, assignedToName: 'Mike Worker' },
        createdAt: new Date(Date.now() - 90 * 60 * 1000), // 1.5 hours ago
      },
      {
        taskId: completedTaskWithRoute.id,
        userId: technician1.id,
        eventType: TaskEventType.STATUS_CHANGED,
        metadata: { from: TaskStatus.ASSIGNED, to: TaskStatus.ACCEPTED },
        createdAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
      },
      {
        taskId: completedTaskWithRoute.id,
        userId: technician1.id,
        eventType: TaskEventType.STATUS_CHANGED,
        metadata: { from: TaskStatus.ACCEPTED, to: TaskStatus.EN_ROUTE },
        createdAt: routeStartTime,
      },
      {
        taskId: completedTaskWithRoute.id,
        userId: technician1.id,
        eventType: TaskEventType.STATUS_CHANGED,
        metadata: { from: TaskStatus.EN_ROUTE, to: TaskStatus.ARRIVED },
        createdAt: routeEndTime,
      },
      {
        taskId: completedTaskWithRoute.id,
        userId: technician1.id,
        eventType: TaskEventType.STATUS_CHANGED,
        metadata: { from: TaskStatus.ARRIVED, to: TaskStatus.IN_PROGRESS },
        createdAt: new Date(routeEndTime.getTime() + 2 * 60 * 1000),
      },
      {
        taskId: completedTaskWithRoute.id,
        userId: technician1.id,
        eventType: TaskEventType.STATUS_CHANGED,
        metadata: { from: TaskStatus.IN_PROGRESS, to: TaskStatus.COMPLETED },
        createdAt: new Date(Date.now() - 5 * 60 * 1000),
      },
    ],
  });

  // Add comments to the completed task
  await prisma.comment.createMany({
    data: [
      {
        taskId: completedTaskWithRoute.id,
        userId: dispatcherUser.id,
        content: 'High priority - customer waiting. Please proceed ASAP.',
        createdAt: new Date(Date.now() - 85 * 60 * 1000),
      },
      {
        taskId: completedTaskWithRoute.id,
        userId: technician1.id,
        content: 'On my way now. ETA 30 minutes.',
        createdAt: routeStartTime,
      },
      {
        taskId: completedTaskWithRoute.id,
        userId: technician1.id,
        content: 'Arrived on site. Starting diagnostic.',
        createdAt: routeEndTime,
      },
      {
        taskId: completedTaskWithRoute.id,
        userId: technician1.id,
        content: 'Issue identified: faulty compressor. Replacement completed. System running normally now.',
        createdAt: new Date(Date.now() - 5 * 60 * 1000),
      },
    ],
  });

  console.log('Created events and comments for completed task with route');

  // Create historical maintenance tasks for the HVAC asset
  // These will show in the maintenance history section
  const historicalTask1 = await prisma.task.create({
    data: {
      title: 'Annual HVAC Inspection',
      description: 'Routine annual inspection of rooftop HVAC unit',
      status: TaskStatus.COMPLETED,
      priority: TaskPriority.MEDIUM,
      organizationId: organization.id,
      createdById: clientUser.id,
      assignedToId: technician2.id,
      locationLat: 40.7580,
      locationLng: -73.9855,
      locationAddress: 'Building A, Rooftop',
      assetId: rooftopHVAC.id,
      createdAt: new Date('2025-10-15T09:00:00'),
      updatedAt: new Date('2025-10-15T11:30:00'),
      routeDistance: 2100,
    },
  });

  const historicalTask2 = await prisma.task.create({
    data: {
      title: 'Filter Replacement',
      description: 'Quarterly filter replacement for HVAC system',
      status: TaskStatus.COMPLETED,
      priority: TaskPriority.LOW,
      organizationId: organization.id,
      createdById: clientUser.id,
      assignedToId: technician1.id,
      locationLat: 40.7580,
      locationLng: -73.9855,
      locationAddress: 'Building A, Rooftop',
      assetId: rooftopHVAC.id,
      createdAt: new Date('2025-07-10T14:00:00'),
      updatedAt: new Date('2025-07-10T15:15:00'),
      routeDistance: 1500,
    },
  });

  const historicalTask3 = await prisma.task.create({
    data: {
      title: 'Refrigerant Recharge',
      description: 'Low refrigerant detected during inspection. Recharge required.',
      status: TaskStatus.COMPLETED,
      priority: TaskPriority.HIGH,
      organizationId: organization.id,
      createdById: clientUser.id,
      assignedToId: technician1.id,
      locationLat: 40.7580,
      locationLng: -73.9855,
      locationAddress: 'Building A, Rooftop',
      assetId: rooftopHVAC.id,
      createdAt: new Date('2025-04-22T10:00:00'),
      updatedAt: new Date('2025-04-22T12:45:00'),
      routeDistance: 3200,
    },
  });

  // Create events for historical tasks
  await prisma.taskEvent.createMany({
    data: [
      // Historical task 1 events
      {
        taskId: historicalTask1.id,
        userId: clientUser.id,
        eventType: TaskEventType.CREATED,
        metadata: { title: historicalTask1.title },
        createdAt: new Date('2025-10-15T09:00:00'),
      },
      {
        taskId: historicalTask1.id,
        userId: technician2.id,
        eventType: TaskEventType.STATUS_CHANGED,
        metadata: { from: TaskStatus.ASSIGNED, to: TaskStatus.COMPLETED },
        createdAt: new Date('2025-10-15T11:30:00'),
      },
      // Historical task 2 events
      {
        taskId: historicalTask2.id,
        userId: clientUser.id,
        eventType: TaskEventType.CREATED,
        metadata: { title: historicalTask2.title },
        createdAt: new Date('2025-07-10T14:00:00'),
      },
      {
        taskId: historicalTask2.id,
        userId: technician1.id,
        eventType: TaskEventType.STATUS_CHANGED,
        metadata: { from: TaskStatus.ASSIGNED, to: TaskStatus.COMPLETED },
        createdAt: new Date('2025-07-10T15:15:00'),
      },
      // Historical task 3 events
      {
        taskId: historicalTask3.id,
        userId: clientUser.id,
        eventType: TaskEventType.CREATED,
        metadata: { title: historicalTask3.title },
        createdAt: new Date('2025-04-22T10:00:00'),
      },
      {
        taskId: historicalTask3.id,
        userId: technician1.id,
        eventType: TaskEventType.STATUS_CHANGED,
        metadata: { from: TaskStatus.ASSIGNED, to: TaskStatus.COMPLETED },
        createdAt: new Date('2025-04-22T12:45:00'),
      },
    ],
  });

  console.log('Created', 3, 'historical maintenance tasks for HVAC asset');

  // ============================================
  // Create ServiceReports for completed tasks
  // ============================================

  // Service Report for the main completed task (compressor repair)
  const mainReport = await prisma.serviceReport.create({
    data: {
      taskId: completedTaskWithRoute.id,
      assetId: rooftopHVAC.id,
      summary: 'Replaced faulty compressor and recharged refrigerant system',
      workPerformed: `1. Performed initial diagnostic on HVAC system
2. Identified faulty compressor causing system shutdown
3. Safely recovered existing refrigerant
4. Removed and replaced Carrier CMP-2024-A compressor unit
5. Installed new compressor with proper mounting
6. Recharged system with R-410A refrigerant (2 lbs)
7. Performed leak test on all connections
8. Tested system operation - cooling within normal parameters
9. Cleaned work area and disposed of old equipment`,
      workDuration: 5400, // 1.5 hours in seconds
      technicianSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      customerSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
      customerName: 'John Smith',
      completedAt: new Date(Date.now() - 5 * 60 * 1000),
      completedById: technician1.id,
      organizationId: organization.id,
    },
  });

  // Parts used for compressor repair
  await prisma.partUsed.createMany({
    data: [
      {
        reportId: mainReport.id,
        name: 'Carrier Compressor',
        partNumber: 'CMP-2024-A',
        quantity: 1,
        unitCost: 450.00,
        notes: 'OEM replacement compressor',
      },
      {
        reportId: mainReport.id,
        name: 'Refrigerant R-410A',
        partNumber: 'REF-410A-2LB',
        quantity: 2,
        unitCost: 85.00,
        notes: '2 lbs total',
      },
      {
        reportId: mainReport.id,
        name: 'Compressor Mounting Kit',
        partNumber: 'MNT-KIT-001',
        quantity: 1,
        unitCost: 35.00,
      },
    ],
  });

  // Attachments for compressor repair (placeholder URLs)
  await prisma.reportAttachment.createMany({
    data: [
      {
        reportId: mainReport.id,
        type: ReportAttachmentType.BEFORE,
        fileName: 'damaged_compressor.jpg',
        fileUrl: 'https://placehold.co/800x600/dc2626/ffffff?text=Damaged+Compressor',
        fileSize: 245000,
        caption: 'Damaged compressor unit - visible burn marks on windings',
      },
      {
        reportId: mainReport.id,
        type: ReportAttachmentType.BEFORE,
        fileName: 'hvac_unit_before.jpg',
        fileUrl: 'https://placehold.co/800x600/f59e0b/ffffff?text=HVAC+Before',
        fileSize: 312000,
        caption: 'HVAC unit before repair - system offline',
      },
      {
        reportId: mainReport.id,
        type: ReportAttachmentType.AFTER,
        fileName: 'new_compressor_installed.jpg',
        fileUrl: 'https://placehold.co/800x600/16a34a/ffffff?text=New+Compressor',
        fileSize: 287000,
        caption: 'New compressor installed and secured',
      },
      {
        reportId: mainReport.id,
        type: ReportAttachmentType.AFTER,
        fileName: 'system_running.jpg',
        fileUrl: 'https://placehold.co/800x600/2563eb/ffffff?text=System+Running',
        fileSize: 198000,
        caption: 'System running normally after repair',
      },
    ],
  });

  console.log('Created service report for main completed task with parts and photos');

  // Service Report for Annual HVAC Inspection
  const inspectionReport = await prisma.serviceReport.create({
    data: {
      taskId: historicalTask1.id,
      assetId: rooftopHVAC.id,
      summary: 'Completed annual HVAC inspection - system in good condition',
      workPerformed: `1. Inspected all electrical connections
2. Checked refrigerant levels - within normal range
3. Cleaned condenser coils
4. Replaced air filters
5. Tested thermostat operation
6. Verified drain lines are clear
7. Checked blower motor and bearings
8. Documented all readings and measurements`,
      workDuration: 8100, // 2h 15m in seconds
      technicianSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      customerSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
      customerName: 'Building Manager',
      completedAt: new Date('2025-10-15T11:30:00'),
      completedById: technician2.id,
      organizationId: organization.id,
    },
  });

  await prisma.partUsed.createMany({
    data: [
      {
        reportId: inspectionReport.id,
        name: 'HVAC Air Filter 20x25x4',
        partNumber: 'FLT-20254-MERV13',
        quantity: 2,
        unitCost: 22.50,
        notes: 'MERV 13 rated filters',
      },
    ],
  });

  await prisma.reportAttachment.createMany({
    data: [
      {
        reportId: inspectionReport.id,
        type: ReportAttachmentType.BEFORE,
        fileName: 'dirty_filter.jpg',
        fileUrl: 'https://placehold.co/800x600/9ca3af/ffffff?text=Dirty+Filter',
        fileSize: 156000,
        caption: 'Old filter showing normal wear',
      },
      {
        reportId: inspectionReport.id,
        type: ReportAttachmentType.AFTER,
        fileName: 'clean_coils.jpg',
        fileUrl: 'https://placehold.co/800x600/16a34a/ffffff?text=Clean+Coils',
        fileSize: 178000,
        caption: 'Condenser coils after cleaning',
      },
    ],
  });

  console.log('Created service report for annual inspection');

  // Service Report for Filter Replacement
  const filterReport = await prisma.serviceReport.create({
    data: {
      taskId: historicalTask2.id,
      assetId: rooftopHVAC.id,
      summary: 'Quarterly filter replacement completed',
      workPerformed: `1. Removed old air filters
2. Inspected filter housing for debris
3. Installed new MERV 13 filters
4. Verified proper seal
5. Logged filter replacement date`,
      workDuration: 2700, // 45 minutes
      technicianSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      completedAt: new Date('2025-07-10T15:15:00'),
      completedById: technician1.id,
      organizationId: organization.id,
    },
  });

  await prisma.partUsed.createMany({
    data: [
      {
        reportId: filterReport.id,
        name: 'HVAC Air Filter 20x25x4',
        partNumber: 'FLT-20254-MERV13',
        quantity: 4,
        unitCost: 22.50,
        notes: 'Quarterly replacement - MERV 13',
      },
    ],
  });

  console.log('Created service report for filter replacement');

  // Service Report for Refrigerant Recharge
  const rechargeReport = await prisma.serviceReport.create({
    data: {
      taskId: historicalTask3.id,
      assetId: rooftopHVAC.id,
      summary: 'Refrigerant recharge completed - system cooling normally',
      workPerformed: `1. Connected gauges and checked system pressures
2. Identified low refrigerant level (15% below spec)
3. Performed leak check on all connections
4. Found and repaired minor leak at service valve
5. Evacuated system and recharged with R-410A
6. Verified operating pressures within spec
7. Monitored system for 30 minutes to confirm proper operation`,
      workDuration: 9900, // 2h 45m
      technicianSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      customerSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
      customerName: 'John Owner',
      completedAt: new Date('2025-04-22T12:45:00'),
      completedById: technician1.id,
      organizationId: organization.id,
    },
  });

  await prisma.partUsed.createMany({
    data: [
      {
        reportId: rechargeReport.id,
        name: 'Refrigerant R-410A',
        partNumber: 'REF-410A-2LB',
        quantity: 3,
        unitCost: 85.00,
        notes: '3 lbs added to system',
      },
      {
        reportId: rechargeReport.id,
        name: 'Service Valve O-Ring Kit',
        partNumber: 'ORK-SV-001',
        quantity: 1,
        unitCost: 12.00,
        notes: 'Replaced leaking O-ring',
      },
    ],
  });

  await prisma.reportAttachment.createMany({
    data: [
      {
        reportId: rechargeReport.id,
        type: ReportAttachmentType.BEFORE,
        fileName: 'low_pressure_reading.jpg',
        fileUrl: 'https://placehold.co/800x600/dc2626/ffffff?text=Low+Pressure',
        fileSize: 134000,
        caption: 'Gauge showing low refrigerant pressure',
      },
      {
        reportId: rechargeReport.id,
        type: ReportAttachmentType.AFTER,
        fileName: 'normal_pressure.jpg',
        fileUrl: 'https://placehold.co/800x600/16a34a/ffffff?text=Normal+Pressure',
        fileSize: 142000,
        caption: 'System pressure within normal range after recharge',
      },
    ],
  });

  console.log('Created service report for refrigerant recharge');
  console.log('Created 4 service reports total with parts and attachments');

  // Also create an EN_ROUTE task to test live tracking view
  const liveRouteStartTime = new Date(Date.now() - 15 * 60 * 1000); // Started 15 minutes ago

  const enRouteTask = await prisma.task.create({
    data: {
      title: 'Network Setup - Currently En Route',
      description: 'Network infrastructure setup at new office location. Technician currently on the way.',
      status: TaskStatus.EN_ROUTE,
      priority: TaskPriority.URGENT,
      organizationId: organization.id,
      createdById: clientUser.id,
      assignedToId: technician2.id,
      locationLat: 40.7484,
      locationLng: -73.9857,
      locationAddress: 'Empire State Building, 350 5th Ave, New York, NY 10118',
      dueDate: new Date(Date.now() + 2 * 60 * 60 * 1000), // Due in 2 hours
      routeStartedAt: liveRouteStartTime,
      routeDistance: 1850, // Current distance traveled
    },
  });

  console.log('Created en-route task:', enRouteTask.title);

  // Create GPS points for the live route (in progress)
  const liveRoutePoints = [
    // Starting point - Lower Manhattan
    { lat: 40.7074, lng: -74.0113, minutesFromStart: 0 },
    { lat: 40.7095, lng: -74.0085, minutesFromStart: 2 },
    { lat: 40.7120, lng: -74.0055, minutesFromStart: 4 },
    { lat: 40.7148, lng: -74.0025, minutesFromStart: 6 },
    // Heading up Broadway
    { lat: 40.7175, lng: -73.9998, minutesFromStart: 8 },
    { lat: 40.7205, lng: -73.9970, minutesFromStart: 10 },
    { lat: 40.7235, lng: -73.9942, minutesFromStart: 12 },
    // Current position (still moving)
    { lat: 40.7265, lng: -73.9915, minutesFromStart: 14 },
  ];

  await prisma.locationHistory.createMany({
    data: liveRoutePoints.map((point) => ({
      userId: technician2.id,
      taskId: enRouteTask.id,
      lat: point.lat,
      lng: point.lng,
      accuracy: Math.floor(Math.random() * 8) + 5,
      timestamp: new Date(liveRouteStartTime.getTime() + point.minutesFromStart * 60 * 1000),
    })),
  });

  // Update technician2's last location to match the route
  await prisma.workerLastLocation.update({
    where: { userId: technician2.id },
    data: {
      lat: 40.7265,
      lng: -73.9915,
      accuracy: 8,
      updatedAt: new Date(),
    },
  });

  console.log('Created', liveRoutePoints.length, 'GPS points for live tracking task');

  // Create task events for the en-route task
  await prisma.taskEvent.createMany({
    data: [
      {
        taskId: enRouteTask.id,
        userId: clientUser.id,
        eventType: TaskEventType.CREATED,
        metadata: { title: enRouteTask.title },
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
      },
      {
        taskId: enRouteTask.id,
        userId: dispatcherUser.id,
        eventType: TaskEventType.ASSIGNED,
        metadata: { assignedToId: technician2.id, assignedToName: 'Sarah Worker' },
        createdAt: new Date(Date.now() - 45 * 60 * 1000),
      },
      {
        taskId: enRouteTask.id,
        userId: technician2.id,
        eventType: TaskEventType.STATUS_CHANGED,
        metadata: { from: TaskStatus.ASSIGNED, to: TaskStatus.ACCEPTED },
        createdAt: new Date(Date.now() - 30 * 60 * 1000),
      },
      {
        taskId: enRouteTask.id,
        userId: technician2.id,
        eventType: TaskEventType.STATUS_CHANGED,
        metadata: { from: TaskStatus.ACCEPTED, to: TaskStatus.EN_ROUTE },
        createdAt: liveRouteStartTime,
      },
    ],
  });

  await prisma.comment.create({
    data: {
      taskId: enRouteTask.id,
      userId: technician2.id,
      content: 'Heading out now. Traffic looks moderate, should arrive in about 20 minutes.',
      createdAt: liveRouteStartTime,
    },
  });

  console.log('Created events and comments for en-route task');

  console.log('\nSeed completed successfully!');
  console.log('\nTest credentials:');
  console.log('  Admin:       client@example.com / password123 (platform: BOTH)');
  console.log('  Dispatcher:  dispatcher@example.com / password123 (platform: WEB)');
  console.log('  Technician1: technician1@example.com / password123 (platform: MOBILE, FULL_TIME)');
  console.log('  Technician2: technician2@example.com / password123 (platform: MOBILE, FREELANCER)');
  console.log('\nCompany Locations:');
  console.log('  - Main Office (NYC): 40.7128, -74.0060 (20m geofence)');
  console.log('  - Warehouse (Brooklyn): 40.6892, -73.9857 (30m geofence)');
  console.log('  - Service Center (Jersey City): 40.7178, -74.0431 (25m geofence)');
  console.log('\nTime Entries:');
  console.log('  - technician1 has 3 time entries (2 completed, 1 currently clocked in)');
  console.log('  - Use GET /attendance/status as technician1 to see current clock-in status');
  console.log('  - Use GET /attendance/history as technician1 to see attendance history');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
