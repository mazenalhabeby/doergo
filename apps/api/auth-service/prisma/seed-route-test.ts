import { PrismaClient, Role, TaskStatus, TaskPriority, TaskEventType } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Test script to create route tracking test data
 *
 * Creates 2 tasks with different locations and simulates
 * a technician traveling between them with GPS tracking points.
 *
 * Run with: npx ts-node prisma/seed-route-test.ts
 */
async function main() {
  console.log('Creating route tracking test data...\n');

  // Find existing technician and organization
  const technician = await prisma.user.findFirst({
    where: { role: Role.TECHNICIAN },
  });

  if (!technician) {
    console.error('No technician found. Run pnpm db:seed first.');
    return;
  }

  const client = await prisma.user.findFirst({
    where: { role: Role.CLIENT },
  });

  if (!client) {
    console.error('No client found. Run pnpm db:seed first.');
    return;
  }

  console.log(`Using technician: ${technician.firstName} ${technician.lastName} (${technician.email})`);

  if (!technician.organizationId) {
    console.error('Technician has no organization. Run pnpm db:seed first.');
    return;
  }

  const organizationId = technician.organizationId;
  console.log(`Organization ID: ${organizationId}\n`);

  // Location A: Times Square, NYC
  const locationA = {
    lat: 40.7580,
    lng: -73.9855,
    address: 'Times Square, New York, NY 10036',
  };

  // Location B: Central Park (destination)
  const locationB = {
    lat: 40.7829,
    lng: -73.9654,
    address: 'Central Park, New York, NY 10024',
  };

  // Simulated route points (Times Square → Central Park)
  const routePoints = [
    { lat: 40.7580, lng: -73.9855, offsetMinutes: 0 },   // Start: Times Square
    { lat: 40.7610, lng: -73.9840, offsetMinutes: 2 },   // Moving north
    { lat: 40.7650, lng: -73.9800, offsetMinutes: 4 },   //
    { lat: 40.7700, lng: -73.9750, offsetMinutes: 6 },   //
    { lat: 40.7750, lng: -73.9700, offsetMinutes: 8 },   //
    { lat: 40.7800, lng: -73.9670, offsetMinutes: 10 },  //
    { lat: 40.7829, lng: -73.9654, offsetMinutes: 12 },  // End: Central Park
  ];

  // Calculate total distance using Haversine formula
  function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // Earth radius in meters
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  let totalDistance = 0;
  for (let i = 1; i < routePoints.length; i++) {
    totalDistance += haversineDistance(
      routePoints[i - 1].lat, routePoints[i - 1].lng,
      routePoints[i].lat, routePoints[i].lng
    );
  }

  const routeStartedAt = new Date(Date.now() - 15 * 60 * 1000); // Started 15 mins ago
  const routeEndedAt = new Date(Date.now() - 3 * 60 * 1000);    // Arrived 3 mins ago

  // ========== TASK 1: Completed route (ARRIVED) ==========
  console.log('Creating Task 1: Completed route (ARRIVED status)...');

  const task1 = await prisma.task.create({
    data: {
      title: 'Delivery to Central Park',
      description: 'Deliver equipment to Central Park visitor center. Route tracking test with completed journey.',
      status: TaskStatus.ARRIVED,
      priority: TaskPriority.HIGH,
      organizationId: organizationId,
      createdById: client.id,
      assignedToId: technician.id,
      locationLat: locationB.lat,
      locationLng: locationB.lng,
      locationAddress: locationB.address,
      routeStartedAt,
      routeEndedAt,
      routeDistance: totalDistance,
      dueDate: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
    },
  });

  console.log(`  Created task: ${task1.id}`);
  console.log(`  Route: Times Square → Central Park`);
  console.log(`  Distance: ${(totalDistance / 1000).toFixed(2)} km`);
  console.log(`  Duration: 12 minutes`);

  // Create location history for task 1
  const locationHistoryData = routePoints.map((point, index) => ({
    lat: point.lat,
    lng: point.lng,
    accuracy: 5 + Math.random() * 10, // Random accuracy 5-15m
    timestamp: new Date(routeStartedAt.getTime() + point.offsetMinutes * 60 * 1000),
    userId: technician.id,
    taskId: task1.id,
  }));

  await prisma.locationHistory.createMany({
    data: locationHistoryData,
  });

  console.log(`  Created ${locationHistoryData.length} GPS tracking points\n`);

  // Create task events for task 1
  await prisma.taskEvent.createMany({
    data: [
      {
        taskId: task1.id,
        userId: client.id,
        eventType: TaskEventType.CREATED,
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
      },
      {
        taskId: task1.id,
        userId: client.id,
        eventType: TaskEventType.ASSIGNED,
        metadata: { assignedToId: technician.id },
        createdAt: new Date(Date.now() - 30 * 60 * 1000),
      },
      {
        taskId: task1.id,
        userId: technician.id,
        eventType: TaskEventType.STATUS_CHANGED,
        metadata: { from: 'ASSIGNED', to: 'ACCEPTED' },
        createdAt: new Date(Date.now() - 20 * 60 * 1000),
      },
      {
        taskId: task1.id,
        userId: technician.id,
        eventType: TaskEventType.STATUS_CHANGED,
        metadata: { from: 'ACCEPTED', to: 'EN_ROUTE' },
        createdAt: routeStartedAt,
      },
      {
        taskId: task1.id,
        userId: technician.id,
        eventType: TaskEventType.STATUS_CHANGED,
        metadata: { from: 'EN_ROUTE', to: 'ARRIVED' },
        createdAt: routeEndedAt,
      },
    ],
  });

  // ========== TASK 2: Currently EN_ROUTE ==========
  console.log('Creating Task 2: Currently EN_ROUTE (active tracking)...');

  // Location C: Brooklyn Bridge (different start)
  const locationC = {
    lat: 40.7061,
    lng: -73.9969,
    address: 'Brooklyn Bridge, New York, NY',
  };

  // Location D: Empire State Building (destination)
  const locationD = {
    lat: 40.7484,
    lng: -73.9857,
    address: 'Empire State Building, New York, NY 10001',
  };

  // Partial route (still in progress)
  const activeRoutePoints = [
    { lat: 40.7061, lng: -73.9969, offsetMinutes: 0 },   // Start: Brooklyn Bridge
    { lat: 40.7150, lng: -73.9950, offsetMinutes: 3 },   // Moving north
    { lat: 40.7250, lng: -73.9920, offsetMinutes: 6 },   // Current position
  ];

  let activeDistance = 0;
  for (let i = 1; i < activeRoutePoints.length; i++) {
    activeDistance += haversineDistance(
      activeRoutePoints[i - 1].lat, activeRoutePoints[i - 1].lng,
      activeRoutePoints[i].lat, activeRoutePoints[i].lng
    );
  }

  const activeRouteStartedAt = new Date(Date.now() - 6 * 60 * 1000); // Started 6 mins ago

  const task2 = await prisma.task.create({
    data: {
      title: 'Service call at Empire State Building',
      description: 'Emergency repair at Empire State Building. Currently en route - tracking active.',
      status: TaskStatus.EN_ROUTE,
      priority: TaskPriority.URGENT,
      organizationId: organizationId,
      createdById: client.id,
      assignedToId: technician.id,
      locationLat: locationD.lat,
      locationLng: locationD.lng,
      locationAddress: locationD.address,
      routeStartedAt: activeRouteStartedAt,
      routeEndedAt: null,
      routeDistance: activeDistance,
      dueDate: new Date(Date.now() + 1 * 60 * 60 * 1000), // 1 hour from now
    },
  });

  console.log(`  Created task: ${task2.id}`);
  console.log(`  Route: Brooklyn Bridge → Empire State Building`);
  console.log(`  Distance so far: ${(activeDistance / 1000).toFixed(2)} km`);
  console.log(`  Status: EN_ROUTE (active)`);

  // Create location history for task 2
  const activeLocationHistory = activeRoutePoints.map((point) => ({
    lat: point.lat,
    lng: point.lng,
    accuracy: 5 + Math.random() * 10,
    timestamp: new Date(activeRouteStartedAt.getTime() + point.offsetMinutes * 60 * 1000),
    userId: technician.id,
    taskId: task2.id,
  }));

  await prisma.locationHistory.createMany({
    data: activeLocationHistory,
  });

  console.log(`  Created ${activeLocationHistory.length} GPS tracking points\n`);

  // Update technician's last known location to current position
  await prisma.workerLastLocation.upsert({
    where: { userId: technician.id },
    update: {
      lat: activeRoutePoints[activeRoutePoints.length - 1].lat,
      lng: activeRoutePoints[activeRoutePoints.length - 1].lng,
      accuracy: 8,
      updatedAt: new Date(),
    },
    create: {
      userId: technician.id,
      lat: activeRoutePoints[activeRoutePoints.length - 1].lat,
      lng: activeRoutePoints[activeRoutePoints.length - 1].lng,
      accuracy: 8,
    },
  });

  console.log('Updated technician last location to current position\n');

  // ========== Summary ==========
  console.log('=' .repeat(60));
  console.log('ROUTE TRACKING TEST DATA CREATED SUCCESSFULLY');
  console.log('=' .repeat(60));
  console.log('\nTask 1 (Completed Route):');
  console.log(`  ID: ${task1.id}`);
  console.log(`  Status: ARRIVED`);
  console.log(`  Route: Times Square → Central Park`);
  console.log(`  Distance: ${(totalDistance / 1000).toFixed(2)} km`);
  console.log(`  GPS Points: ${locationHistoryData.length}`);

  console.log('\nTask 2 (Active Route):');
  console.log(`  ID: ${task2.id}`);
  console.log(`  Status: EN_ROUTE (live tracking)`);
  console.log(`  Route: Brooklyn Bridge → Empire State Building`);
  console.log(`  Distance so far: ${(activeDistance / 1000).toFixed(2)} km`);
  console.log(`  GPS Points: ${activeLocationHistory.length}`);

  console.log('\n' + '-'.repeat(60));
  console.log('HOW TO TEST:');
  console.log('-'.repeat(60));
  console.log('1. Login as DISPATCHER: dispatcher@example.com / password123');
  console.log('2. Go to Tasks page - you should see both tasks');
  console.log('3. Click on Task 1 to see completed route data');
  console.log('4. Click on Task 2 to see active route data');
  console.log('5. Go to Live Map - select the technician to see route polyline');
  console.log('-'.repeat(60));
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
