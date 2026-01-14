import { PrismaClient, Role, TaskStatus, TaskPriority, TaskEventType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create organizations
  const partnerOrg = await prisma.organization.create({
    data: {
      name: 'Partner Company A',
    },
  });

  const officeOrg = await prisma.organization.create({
    data: {
      name: 'Doergo Operations',
    },
  });

  console.log('Created organizations:', partnerOrg.name, officeOrg.name);

  // Hash password for all users
  const passwordHash = await bcrypt.hash('password123', 10);

  // Create Partner user
  const partnerUser = await prisma.user.create({
    data: {
      email: 'partner@example.com',
      passwordHash,
      firstName: 'John',
      lastName: 'Partner',
      role: Role.PARTNER,
      organizationId: partnerOrg.id,
    },
  });

  // Create Office user
  const officeUser = await prisma.user.create({
    data: {
      email: 'office@example.com',
      passwordHash,
      firstName: 'Jane',
      lastName: 'Office',
      role: Role.OFFICE,
      organizationId: officeOrg.id,
    },
  });

  // Create Worker users
  const worker1 = await prisma.user.create({
    data: {
      email: 'worker1@example.com',
      passwordHash,
      firstName: 'Mike',
      lastName: 'Worker',
      role: Role.WORKER,
      organizationId: officeOrg.id,
    },
  });

  const worker2 = await prisma.user.create({
    data: {
      email: 'worker2@example.com',
      passwordHash,
      firstName: 'Sarah',
      lastName: 'Worker',
      role: Role.WORKER,
      organizationId: officeOrg.id,
    },
  });

  console.log('Created users:', partnerUser.email, officeUser.email, worker1.email, worker2.email);

  // Create sample tasks
  const tasks = await Promise.all([
    prisma.task.create({
      data: {
        title: 'Deliver package to downtown office',
        description: 'Urgent delivery of documents to the main office building',
        status: TaskStatus.NEW,
        priority: TaskPriority.HIGH,
        organizationId: partnerOrg.id,
        createdById: partnerUser.id,
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
        organizationId: partnerOrg.id,
        createdById: partnerUser.id,
        assignedToId: worker1.id,
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
        organizationId: partnerOrg.id,
        createdById: partnerUser.id,
        assignedToId: worker2.id,
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
        organizationId: partnerOrg.id,
        createdById: partnerUser.id,
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
        userId: officeUser.id,
        content: 'Worker has been dispatched to the location.',
      },
      {
        taskId: tasks[2].id,
        userId: worker2.id,
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
        userId: partnerUser.id,
        eventType: TaskEventType.CREATED,
        metadata: { title: tasks[0].title },
      },
      {
        taskId: tasks[1].id,
        userId: officeUser.id,
        eventType: TaskEventType.ASSIGNED,
        metadata: { assignedToId: worker1.id },
      },
      {
        taskId: tasks[2].id,
        userId: worker2.id,
        eventType: TaskEventType.STATUS_CHANGED,
        metadata: { from: TaskStatus.ASSIGNED, to: TaskStatus.IN_PROGRESS },
      },
    ],
  });

  console.log('Created task events');

  console.log('\nSeed completed successfully!');
  console.log('\nTest credentials:');
  console.log('  Partner: partner@example.com / password123');
  console.log('  Office:  office@example.com / password123');
  console.log('  Worker1: worker1@example.com / password123');
  console.log('  Worker2: worker2@example.com / password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
