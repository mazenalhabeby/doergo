import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { TasksService } from '../tasks.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Role, TaskStatus, TaskEventType } from '@doergo/shared';

describe('TasksService', () => {
  let service: TasksService;

  const mockOrganization = {
    id: 'org-123',
    name: 'Test Org',
  };

  const mockUser = {
    id: 'user-123',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
  };

  const mockTechnician = {
    id: 'tech-123',
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane@example.com',
    role: Role.TECHNICIAN,
    organizationId: 'org-123',
    isActive: true,
    specialty: 'electrical',
    rating: 4.5,
    ratingCount: 10,
    maxDailyJobs: 5,
  };

  const mockTask = {
    id: 'task-123',
    title: 'Fix electrical issue',
    description: 'Test description',
    status: TaskStatus.NEW,
    priority: 'MEDIUM',
    organizationId: 'org-123',
    createdById: 'user-123',
    assignedToId: null,
    locationLat: 40.7128,
    locationLng: -74.006,
    locationAddress: '123 Main St',
    dueDate: null,
    assetId: null,
    routeStartedAt: null,
    routeEndedAt: null,
    routeDistance: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: mockUser,
    organization: mockOrganization,
  };

  const mockPrismaService = {
    task: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    taskEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    comment: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const mockNotificationClient = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: 'NOTIFICATION_SERVICE', useValue: mockNotificationClient },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  describe('create', () => {
    const createData = {
      title: 'New Task',
      description: 'Task description',
      priority: 'HIGH',
      userId: 'user-123',
      organizationId: 'org-123',
      locationLat: 40.7128,
      locationLng: -74.006,
      locationAddress: '123 Main St',
    };

    it('should create a task successfully', async () => {
      const createdTask = { ...mockTask, title: 'New Task', priority: 'HIGH' };
      mockPrismaService.task.create.mockResolvedValue(createdTask);
      mockPrismaService.taskEvent.create.mockResolvedValue({ id: 'event-1' });

      const result = await service.create(createData) as any;

      expect(result.success).toBe(true);
      expect(result.data.title).toBe('New Task');
      expect(mockPrismaService.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'New Task',
            status: TaskStatus.NEW,
            priority: 'HIGH',
          }),
        }),
      );
    });

    it('should create a task event after creation', async () => {
      mockPrismaService.task.create.mockResolvedValue(mockTask);
      mockPrismaService.taskEvent.create.mockResolvedValue({ id: 'event-1' });

      await service.create(createData);

      expect(mockPrismaService.taskEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          taskId: mockTask.id,
          userId: createData.userId,
          eventType: TaskEventType.CREATED,
        }),
      });
    });

    it('should emit notification after task creation', async () => {
      mockPrismaService.task.create.mockResolvedValue(mockTask);
      mockPrismaService.taskEvent.create.mockResolvedValue({ id: 'event-1' });

      await service.create(createData);

      expect(mockNotificationClient.emit).toHaveBeenCalledWith('task_created', mockTask);
    });

    it('should use MEDIUM priority as default', async () => {
      const dataWithoutPriority = { ...createData, priority: undefined };
      mockPrismaService.task.create.mockResolvedValue(mockTask);
      mockPrismaService.taskEvent.create.mockResolvedValue({ id: 'event-1' });

      await service.create(dataWithoutPriority);

      expect(mockPrismaService.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            priority: 'MEDIUM',
          }),
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated tasks for DISPATCHER', async () => {
      const tasks = [mockTask];
      mockPrismaService.task.findMany.mockResolvedValue(tasks);
      mockPrismaService.task.count.mockResolvedValue(1);

      const result = await service.findAll({
        page: 1,
        limit: 10,
        userRole: Role.DISPATCHER,
        organizationId: 'org-123',
        userId: 'user-456',
      }) as any;

      expect(result.data).toEqual(tasks);
      expect(result.meta.total).toBe(1);
      expect(mockPrismaService.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-123',
          }),
        }),
      );
    });

    it('should filter by createdById for ADMIN role', async () => {
      mockPrismaService.task.findMany.mockResolvedValue([]);
      mockPrismaService.task.count.mockResolvedValue(0);

      await service.findAll({
        page: 1,
        limit: 10,
        userRole: Role.ADMIN,
        organizationId: 'org-123',
        userId: 'user-123',
      });

      expect(mockPrismaService.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-123',
            createdById: 'user-123',
          }),
        }),
      );
    });

    it('should filter by assignedToId for TECHNICIAN role', async () => {
      mockPrismaService.task.findMany.mockResolvedValue([]);
      mockPrismaService.task.count.mockResolvedValue(0);

      await service.findAll({
        page: 1,
        limit: 10,
        userRole: Role.TECHNICIAN,
        organizationId: 'org-123',
        userId: 'tech-123',
      });

      expect(mockPrismaService.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            assignedToId: 'tech-123',
          }),
        }),
      );
    });

    it('should apply status and priority filters', async () => {
      mockPrismaService.task.findMany.mockResolvedValue([]);
      mockPrismaService.task.count.mockResolvedValue(0);

      await service.findAll({
        page: 1,
        limit: 10,
        userRole: Role.DISPATCHER,
        organizationId: 'org-123',
        userId: 'user-123',
        status: TaskStatus.NEW,
        priority: 'HIGH',
      });

      expect(mockPrismaService.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: TaskStatus.NEW,
            priority: 'HIGH',
          }),
        }),
      );
    });

    it('should return empty array for unknown role', async () => {
      const result = await service.findAll({
        page: 1,
        limit: 10,
        userRole: 'UNKNOWN' as any,
        organizationId: 'org-123',
        userId: 'user-123',
      }) as any;

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });
  });

  describe('findOne', () => {
    it('should return task for DISPATCHER with org access', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue(mockTask);

      const result = await service.findOne({
        id: 'task-123',
        userId: 'user-456',
        userRole: Role.DISPATCHER,
        organizationId: 'org-123',
      }) as any;

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockTask);
    });

    it('should throw NotFoundException for non-existent task', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne({
          id: 'non-existent',
          userId: 'user-123',
          userRole: Role.DISPATCHER,
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for ADMIN accessing other user task', async () => {
      const taskByOtherUser = { ...mockTask, createdById: 'other-user' };
      mockPrismaService.task.findUnique.mockResolvedValue(taskByOtherUser);

      await expect(
        service.findOne({
          id: 'task-123',
          userId: 'user-123',
          userRole: Role.ADMIN,
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for TECHNICIAN not assigned to task', async () => {
      const unassignedTask = { ...mockTask, assignedToId: 'other-tech' };
      mockPrismaService.task.findUnique.mockResolvedValue(unassignedTask);

      await expect(
        service.findOne({
          id: 'task-123',
          userId: 'tech-123',
          userRole: Role.TECHNICIAN,
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('should update task successfully', async () => {
      const updatedTask = { ...mockTask, title: 'Updated Title' };
      mockPrismaService.task.findUnique.mockResolvedValue(mockTask);
      mockPrismaService.task.update.mockResolvedValue(updatedTask);
      mockPrismaService.taskEvent.create.mockResolvedValue({ id: 'event-1' });

      const result = await service.update({
        id: 'task-123',
        title: 'Updated Title',
        userId: 'user-123',
        userRole: Role.DISPATCHER,
        organizationId: 'org-123',
      }) as any;

      expect(result.success).toBe(true);
      expect(result.data.title).toBe('Updated Title');
    });

    it('should throw NotFoundException for non-existent task', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue(null);

      await expect(
        service.update({
          id: 'non-existent',
          title: 'Updated',
          userId: 'user-123',
          userRole: Role.DISPATCHER,
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for different organization', async () => {
      const taskInOtherOrg = { ...mockTask, organizationId: 'other-org' };
      mockPrismaService.task.findUnique.mockResolvedValue(taskInOtherOrg);

      await expect(
        service.update({
          id: 'task-123',
          title: 'Updated',
          userId: 'user-123',
          userRole: Role.DISPATCHER,
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for completed task', async () => {
      const completedTask = { ...mockTask, status: TaskStatus.COMPLETED };
      mockPrismaService.task.findUnique.mockResolvedValue(completedTask);

      await expect(
        service.update({
          id: 'task-123',
          title: 'Updated',
          userId: 'user-123',
          userRole: Role.DISPATCHER,
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for closed task', async () => {
      const closedTask = { ...mockTask, status: TaskStatus.CLOSED };
      mockPrismaService.task.findUnique.mockResolvedValue(closedTask);

      await expect(
        service.update({
          id: 'task-123',
          title: 'Updated',
          userId: 'user-123',
          userRole: Role.DISPATCHER,
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('assign', () => {
    it('should assign technician to task successfully', async () => {
      const assignedTask = { ...mockTask, assignedToId: 'tech-123', status: TaskStatus.ASSIGNED };
      mockPrismaService.task.findUnique.mockResolvedValue(mockTask);
      mockPrismaService.user.findFirst.mockResolvedValue(mockTechnician);
      mockPrismaService.task.update.mockResolvedValue(assignedTask);
      mockPrismaService.taskEvent.create.mockResolvedValue({ id: 'event-1' });

      const result = await service.assign({
        id: 'task-123',
        workerId: 'tech-123',
        userId: 'user-123',
        userRole: Role.DISPATCHER,
        organizationId: 'org-123',
      }) as any;

      expect(result.success).toBe(true);
      expect(result.data.status).toBe(TaskStatus.ASSIGNED);
      expect(mockNotificationClient.emit).toHaveBeenCalledWith('task_assigned', expect.any(Object));
    });

    it('should throw NotFoundException for non-existent task', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue(null);

      await expect(
        service.assign({
          id: 'non-existent',
          workerId: 'tech-123',
          userId: 'user-123',
          userRole: Role.DISPATCHER,
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for different organization', async () => {
      const taskInOtherOrg = { ...mockTask, organizationId: 'other-org' };
      mockPrismaService.task.findUnique.mockResolvedValue(taskInOtherOrg);

      await expect(
        service.assign({
          id: 'task-123',
          workerId: 'tech-123',
          userId: 'user-123',
          userRole: Role.DISPATCHER,
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for task not in assignable state', async () => {
      const inProgressTask = { ...mockTask, status: TaskStatus.IN_PROGRESS };
      mockPrismaService.task.findUnique.mockResolvedValue(inProgressTask);

      await expect(
        service.assign({
          id: 'task-123',
          workerId: 'tech-123',
          userId: 'user-123',
          userRole: Role.DISPATCHER,
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent technician', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue(mockTask);
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(
        service.assign({
          id: 'task-123',
          workerId: 'non-existent',
          userId: 'user-123',
          userRole: Role.DISPATCHER,
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('decline', () => {
    it('should allow assigned technician to decline task', async () => {
      const assignedTask = {
        ...mockTask,
        status: TaskStatus.ASSIGNED,
        assignedToId: 'tech-123',
        assignedTo: { id: 'tech-123', firstName: 'Jane', lastName: 'Smith' },
      };
      const declinedTask = { ...mockTask, status: TaskStatus.NEW, assignedToId: null };

      mockPrismaService.task.findUnique.mockResolvedValue(assignedTask);
      mockPrismaService.task.update.mockResolvedValue(declinedTask);
      mockPrismaService.taskEvent.create.mockResolvedValue({ id: 'event-1' });

      const result = await service.decline({
        id: 'task-123',
        userId: 'tech-123',
        userRole: Role.TECHNICIAN,
        organizationId: 'org-123',
      }) as any;

      expect(result.success).toBe(true);
      expect(result.data.status).toBe(TaskStatus.NEW);
      expect(mockNotificationClient.emit).toHaveBeenCalledWith('task_declined', expect.any(Object));
    });

    it('should throw ForbiddenException for technician not assigned to task', async () => {
      const assignedTask = { ...mockTask, status: TaskStatus.ASSIGNED, assignedToId: 'other-tech' };
      mockPrismaService.task.findUnique.mockResolvedValue(assignedTask);

      await expect(
        service.decline({
          id: 'task-123',
          userId: 'tech-123',
          userRole: Role.TECHNICIAN,
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for task not in ASSIGNED status', async () => {
      const inProgressTask = { ...mockTask, status: TaskStatus.IN_PROGRESS, assignedToId: 'tech-123' };
      mockPrismaService.task.findUnique.mockResolvedValue(inProgressTask);

      await expect(
        service.decline({
          id: 'task-123',
          userId: 'tech-123',
          userRole: Role.TECHNICIAN,
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateStatus', () => {
    it('should allow TECHNICIAN to update assigned task status', async () => {
      const assignedTask = { ...mockTask, status: TaskStatus.ASSIGNED, assignedToId: 'tech-123' };
      const acceptedTask = { ...assignedTask, status: TaskStatus.ACCEPTED };

      mockPrismaService.task.findUnique.mockResolvedValue(assignedTask);
      mockPrismaService.task.update.mockResolvedValue(acceptedTask);
      mockPrismaService.taskEvent.create.mockResolvedValue({ id: 'event-1' });

      const result = await service.updateStatus({
        id: 'task-123',
        status: TaskStatus.ACCEPTED,
        userId: 'tech-123',
        userRole: Role.TECHNICIAN,
        organizationId: 'org-123',
      }) as any;

      expect(result.success).toBe(true);
      expect(result.data.status).toBe(TaskStatus.ACCEPTED);
    });

    it('should set routeStartedAt when transitioning to EN_ROUTE', async () => {
      const acceptedTask = { ...mockTask, status: TaskStatus.ACCEPTED, assignedToId: 'tech-123' };
      mockPrismaService.task.findUnique.mockResolvedValue(acceptedTask);
      mockPrismaService.task.update.mockResolvedValue({ ...acceptedTask, status: TaskStatus.EN_ROUTE });
      mockPrismaService.taskEvent.create.mockResolvedValue({ id: 'event-1' });

      await service.updateStatus({
        id: 'task-123',
        status: TaskStatus.EN_ROUTE,
        userId: 'tech-123',
        userRole: Role.TECHNICIAN,
        organizationId: 'org-123',
      });

      expect(mockPrismaService.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            routeStartedAt: expect.any(Date),
            routeDistance: 0,
          }),
        }),
      );
    });

    it('should set routeEndedAt when transitioning to ARRIVED', async () => {
      const enRouteTask = { ...mockTask, status: TaskStatus.EN_ROUTE, assignedToId: 'tech-123' };
      mockPrismaService.task.findUnique.mockResolvedValue(enRouteTask);
      mockPrismaService.task.update.mockResolvedValue({ ...enRouteTask, status: TaskStatus.ARRIVED });
      mockPrismaService.taskEvent.create.mockResolvedValue({ id: 'event-1' });

      await service.updateStatus({
        id: 'task-123',
        status: TaskStatus.ARRIVED,
        userId: 'tech-123',
        userRole: Role.TECHNICIAN,
        organizationId: 'org-123',
      });

      expect(mockPrismaService.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            routeEndedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should throw ForbiddenException if TECHNICIAN tries to cancel', async () => {
      const assignedTask = { ...mockTask, status: TaskStatus.ASSIGNED, assignedToId: 'tech-123' };
      mockPrismaService.task.findUnique.mockResolvedValue(assignedTask);

      await expect(
        service.updateStatus({
          id: 'task-123',
          status: TaskStatus.CANCELED,
          userId: 'tech-123',
          userRole: Role.TECHNICIAN,
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for invalid status transition', async () => {
      // TECHNICIAN assigned to task tries invalid transition: ASSIGNED -> COMPLETED (skipping ACCEPTED, EN_ROUTE, etc.)
      const assignedTask = { ...mockTask, status: TaskStatus.ASSIGNED, assignedToId: 'user-123' };
      mockPrismaService.task.findUnique.mockResolvedValue(assignedTask);

      await expect(
        service.updateStatus({
          id: 'task-123',
          status: TaskStatus.COMPLETED,
          userId: 'user-123',
          userRole: Role.TECHNICIAN,
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow DISPATCHER to cancel task', async () => {
      const assignedTask = { ...mockTask, status: TaskStatus.ASSIGNED };
      const canceledTask = { ...assignedTask, status: TaskStatus.CANCELED };

      mockPrismaService.task.findUnique.mockResolvedValue(assignedTask);
      mockPrismaService.task.update.mockResolvedValue(canceledTask);
      mockPrismaService.taskEvent.create.mockResolvedValue({ id: 'event-1' });

      const result = await service.updateStatus({
        id: 'task-123',
        status: TaskStatus.CANCELED,
        userId: 'user-123',
        userRole: Role.DISPATCHER,
        organizationId: 'org-123',
      }) as any;

      expect(result.success).toBe(true);
      expect(result.data.status).toBe(TaskStatus.CANCELED);
    });
  });

  describe('remove', () => {
    it('should delete task successfully', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue(mockTask);
      mockPrismaService.task.delete.mockResolvedValue(mockTask);

      const result = await service.remove({
        id: 'task-123',
        userId: 'user-123',
        userRole: Role.ADMIN,
        organizationId: 'org-123',
      }) as any;

      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException for non-existent task', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue(null);

      await expect(
        service.remove({
          id: 'non-existent',
          userId: 'user-123',
          userRole: Role.ADMIN,
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for in-progress task', async () => {
      const inProgressTask = { ...mockTask, status: TaskStatus.IN_PROGRESS };
      mockPrismaService.task.findUnique.mockResolvedValue(inProgressTask);

      await expect(
        service.remove({
          id: 'task-123',
          userId: 'user-123',
          userRole: Role.ADMIN,
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for completed task', async () => {
      const completedTask = { ...mockTask, status: TaskStatus.COMPLETED };
      mockPrismaService.task.findUnique.mockResolvedValue(completedTask);

      await expect(
        service.remove({
          id: 'task-123',
          userId: 'user-123',
          userRole: Role.ADMIN,
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getTimeline', () => {
    it('should return task events for accessible task', async () => {
      const events = [
        { id: 'event-1', eventType: TaskEventType.CREATED, taskId: 'task-123' },
        { id: 'event-2', eventType: TaskEventType.ASSIGNED, taskId: 'task-123' },
      ];
      mockPrismaService.task.findUnique.mockResolvedValue(mockTask);
      mockPrismaService.taskEvent.findMany.mockResolvedValue(events);

      const result = await service.getTimeline({
        id: 'task-123',
        userId: 'user-123',
        userRole: Role.DISPATCHER,
        organizationId: 'org-123',
      }) as any;

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should throw NotFoundException for non-existent task', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue(null);

      await expect(
        service.getTimeline({
          id: 'non-existent',
          userId: 'user-123',
          userRole: Role.DISPATCHER,
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('addComment', () => {
    it('should add comment to accessible task', async () => {
      const comment = {
        id: 'comment-1',
        content: 'Test comment',
        taskId: 'task-123',
        userId: 'user-123',
        user: mockUser,
      };

      mockPrismaService.task.findUnique.mockResolvedValue(mockTask);
      mockPrismaService.comment.create.mockResolvedValue(comment);
      mockPrismaService.taskEvent.create.mockResolvedValue({ id: 'event-1' });

      const result = await service.addComment({
        taskId: 'task-123',
        content: 'Test comment',
        userId: 'user-123',
        userRole: Role.DISPATCHER,
        organizationId: 'org-123',
      }) as any;

      expect(result.success).toBe(true);
      expect(result.data.content).toBe('Test comment');
      expect(mockNotificationClient.emit).toHaveBeenCalledWith('task_comment_added', expect.any(Object));
    });

    it('should throw NotFoundException for non-existent task', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue(null);

      await expect(
        service.addComment({
          taskId: 'non-existent',
          content: 'Test comment',
          userId: 'user-123',
          userRole: Role.DISPATCHER,
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getComments', () => {
    it('should return comments for accessible task', async () => {
      const comments = [
        { id: 'comment-1', content: 'Comment 1', taskId: 'task-123', user: mockUser },
        { id: 'comment-2', content: 'Comment 2', taskId: 'task-123', user: mockUser },
      ];

      mockPrismaService.task.findUnique.mockResolvedValue(mockTask);
      mockPrismaService.comment.findMany.mockResolvedValue(comments);

      const result = await service.getComments({
        taskId: 'task-123',
        userId: 'user-123',
        userRole: Role.DISPATCHER,
        organizationId: 'org-123',
      }) as any;

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });
  });

  describe('getStatusCounts', () => {
    it('should return status counts for DISPATCHER', async () => {
      mockPrismaService.task.groupBy.mockResolvedValue([
        { status: TaskStatus.NEW, _count: { status: 5 } },
        { status: TaskStatus.ASSIGNED, _count: { status: 3 } },
        { status: TaskStatus.COMPLETED, _count: { status: 10 } },
      ]);
      mockPrismaService.task.count.mockResolvedValue(18);

      const result = await service.getStatusCounts({
        userId: 'user-123',
        userRole: Role.DISPATCHER,
        organizationId: 'org-123',
      }) as any;

      expect(result.success).toBe(true);
      expect(result.data[TaskStatus.NEW]).toBe(5);
      expect(result.data[TaskStatus.ASSIGNED]).toBe(3);
      expect(result.data.all).toBe(18);
    });

    it('should return empty object for unknown role', async () => {
      const result = await service.getStatusCounts({
        userId: 'user-123',
        userRole: 'UNKNOWN' as any,
        organizationId: 'org-123',
      }) as any;

      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });
  });

  describe('getSuggestedTechnicians', () => {
    it('should return scored technicians for DISPATCHER', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue(mockTask);
      mockPrismaService.user.findMany.mockResolvedValue([
        {
          ...mockTechnician,
          lastLocation: { lat: 40.7128, lng: -74.006 },
          assignedTasks: [],
        },
      ]);
      mockPrismaService.task.count.mockResolvedValue(2);

      const result = await service.getSuggestedTechnicians({
        taskId: 'task-123',
        userId: 'user-123',
        userRole: Role.DISPATCHER,
        organizationId: 'org-123',
      }) as any;

      expect(result.success).toBe(true);
      expect(result.data.technicians).toHaveLength(1);
      expect(result.data.technicians[0]).toHaveProperty('score');
      expect(result.data.technicians[0]).toHaveProperty('scoreBreakdown');
    });

    it('should throw ForbiddenException for TECHNICIAN role', async () => {
      await expect(
        service.getSuggestedTechnicians({
          taskId: 'task-123',
          userId: 'tech-123',
          userRole: Role.TECHNICIAN,
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for non-existent task', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue(null);

      await expect(
        service.getSuggestedTechnicians({
          taskId: 'non-existent',
          userId: 'user-123',
          userRole: Role.DISPATCHER,
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for task in different organization', async () => {
      const taskInOtherOrg = { ...mockTask, organizationId: 'other-org' };
      mockPrismaService.task.findUnique.mockResolvedValue(taskInOtherOrg);

      await expect(
        service.getSuggestedTechnicians({
          taskId: 'task-123',
          userId: 'user-123',
          userRole: Role.DISPATCHER,
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
