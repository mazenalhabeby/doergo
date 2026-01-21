import { PrismaClient, Role, TaskStatus, TaskPriority, TaskEventType } from '@prisma/client';
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

  // Create Client user (organization owner)
  const clientUser = await prisma.user.create({
    data: {
      email: 'client@example.com',
      passwordHash,
      firstName: 'John',
      lastName: 'Owner',
      role: Role.CLIENT,
      organizationId: organization.id,
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
    },
  });

  console.log('Created users:', clientUser.email, dispatcherUser.email, technician1.email, technician2.email);

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

  console.log('\nSeed completed successfully!');
  console.log('\nTest credentials:');
  console.log('  Client:      client@example.com / password123');
  console.log('  Dispatcher:  dispatcher@example.com / password123');
  console.log('  Technician1: technician1@example.com / password123');
  console.log('  Technician2: technician2@example.com / password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
