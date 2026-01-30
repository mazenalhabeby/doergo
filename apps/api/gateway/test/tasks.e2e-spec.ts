import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { of } from 'rxjs';
import { JwtService, JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { Role, TaskStatus, TaskPriority } from '@doergo/shared';
import { TasksController } from '../src/modules/tasks/tasks.controller';
import { TasksService } from '../src/modules/tasks/tasks.service';
import { TasksQueueService } from '../src/modules/tasks/tasks.queue.service';

describe('TasksController (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let mockTaskService: any;
  let mockTaskQueueService: any;

  const mockAdminUser = {
    id: 'admin-123',
    email: 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    role: Role.ADMIN,
    organizationId: 'org-123',
    platform: 'BOTH',
    canCreateTasks: true,
    canViewAllTasks: true,
    canAssignTasks: true,
    canManageUsers: true,
  };

  const mockDispatcherUser = {
    id: 'dispatcher-123',
    email: 'dispatcher@example.com',
    firstName: 'Dispatcher',
    lastName: 'User',
    role: Role.DISPATCHER,
    organizationId: 'org-123',
    platform: 'WEB',
    canCreateTasks: false,
    canViewAllTasks: true,
    canAssignTasks: true,
    canManageUsers: false,
  };

  const mockTechnicianUser = {
    id: 'tech-123',
    email: 'tech@example.com',
    firstName: 'Technician',
    lastName: 'User',
    role: Role.TECHNICIAN,
    organizationId: 'org-123',
    platform: 'MOBILE',
    canCreateTasks: false,
    canViewAllTasks: false,
    canAssignTasks: false,
    canManageUsers: false,
  };

  const mockTask = {
    id: 'task-123',
    title: 'Test Task',
    description: 'Test Description',
    status: TaskStatus.NEW,
    priority: TaskPriority.MEDIUM,
    organizationId: 'org-123',
    createdById: 'admin-123',
    assignedToId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Custom guards for testing
  class TestJwtAuthGuard {
    constructor(
      private reflector: Reflector,
      private jwtSvc: JwtService,
    ) {}

    canActivate(context: any): boolean {
      const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
        context.getHandler(),
        context.getClass(),
      ]);

      if (isPublic) {
        return true;
      }

      const req = context.switchToHttp().getRequest();
      const [type, token] = req.headers.authorization?.split(' ') ?? [];

      if (type !== 'Bearer' || !token) {
        return false;
      }

      try {
        const payload = this.jwtSvc.verify(token);
        req.user = payload;
        return true;
      } catch {
        return false;
      }
    }
  }

  class TestRolesGuard {
    constructor(private reflector: Reflector) {}

    canActivate(context: any): boolean {
      const requiredRoles = this.reflector.getAllAndOverride<Role[]>('roles', [
        context.getHandler(),
        context.getClass(),
      ]);

      if (!requiredRoles) {
        return true;
      }

      const { user } = context.switchToHttp().getRequest();
      return requiredRoles.includes(user?.role);
    }
  }

  beforeAll(async () => {
    mockTaskService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      getStatusCounts: jest.fn(),
      getSuggestedTechnicians: jest.fn(),
      getTimeline: jest.fn(),
      getComments: jest.fn(),
    };

    mockTaskQueueService = {
      createTask: jest.fn(),
      updateTask: jest.fn(),
      assignTask: jest.fn(),
      updateTaskStatus: jest.fn(),
      declineTask: jest.fn(),
      deleteTask: jest.fn(),
      addComment: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
        JwtModule.register({
          secret: 'test-secret-key-for-testing-purposes-only',
          signOptions: { expiresIn: '1h' },
        }),
        ThrottlerModule.forRoot([
          { name: 'default', ttl: 60000, limit: 1000 },
        ]),
      ],
      controllers: [TasksController],
      providers: [
        {
          provide: TasksService,
          useValue: mockTaskService,
        },
        {
          provide: TasksQueueService,
          useValue: mockTaskQueueService,
        },
        {
          provide: APP_GUARD,
          useClass: ThrottlerGuard,
        },
        {
          provide: APP_GUARD,
          useFactory: (reflector: Reflector, jwtSvc: JwtService) => {
            return new TestJwtAuthGuard(reflector, jwtSvc);
          },
          inject: [Reflector, JwtService],
        },
        {
          provide: APP_GUARD,
          useFactory: (reflector: Reflector) => {
            return new TestRolesGuard(reflector);
          },
          inject: [Reflector],
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    jwtService = moduleFixture.get<JwtService>(JwtService);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /tasks (Create Task)', () => {
    const createTaskDto = {
      title: 'New Task',
      description: 'Task description',
      priority: TaskPriority.HIGH,
    };

    it('should allow ADMIN to create task', async () => {
      const token = jwtService.sign(mockAdminUser);
      mockTaskQueueService.createTask.mockResolvedValue({
        success: true,
        data: { ...mockTask, ...createTaskDto },
      });

      const response = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send(createTaskDto)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe(createTaskDto.title);
    });

    it('should allow DISPATCHER to create task', async () => {
      const token = jwtService.sign(mockDispatcherUser);
      mockTaskQueueService.createTask.mockResolvedValue({
        success: true,
        data: mockTask,
      });

      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send(createTaskDto)
        .expect(201);
    });

    it('should reject TECHNICIAN from creating task', async () => {
      const token = jwtService.sign(mockTechnicianUser);

      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send(createTaskDto)
        .expect(403);
    });

    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post('/tasks')
        .send(createTaskDto)
        .expect(403);
    });
  });

  describe('GET /tasks (List Tasks)', () => {
    it('should return tasks for ADMIN', async () => {
      const token = jwtService.sign(mockAdminUser);
      mockTaskService.findAll.mockResolvedValue({
        success: true,
        data: [mockTask],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      });

      const response = await request(app.getHttpServer())
        .get('/tasks')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should return tasks for DISPATCHER', async () => {
      const token = jwtService.sign(mockDispatcherUser);
      mockTaskService.findAll.mockResolvedValue({
        success: true,
        data: [mockTask],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      });

      const response = await request(app.getHttpServer())
        .get('/tasks')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return tasks for TECHNICIAN', async () => {
      const token = jwtService.sign(mockTechnicianUser);
      const assignedTask = { ...mockTask, assignedToId: 'tech-123' };
      mockTaskService.findAll.mockResolvedValue({
        success: true,
        data: [assignedTask],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      });

      const response = await request(app.getHttpServer())
        .get('/tasks')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should support filtering by status', async () => {
      const token = jwtService.sign(mockAdminUser);
      mockTaskService.findAll.mockResolvedValue({
        success: true,
        data: [],
        meta: { total: 0 },
      });

      await request(app.getHttpServer())
        .get('/tasks')
        .query({ status: TaskStatus.COMPLETED })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(mockTaskService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ status: TaskStatus.COMPLETED }),
      );
    });
  });

  describe('GET /tasks/:id (Get Task)', () => {
    it('should return task for authorized user', async () => {
      const token = jwtService.sign(mockAdminUser);
      mockTaskService.findOne.mockResolvedValue({
        success: true,
        data: mockTask,
      });

      const response = await request(app.getHttpServer())
        .get('/tasks/task-123')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('task-123');
    });

    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer()).get('/tasks/task-123').expect(403);
    });
  });

  describe('PUT /tasks/:id (Update Task)', () => {
    const updateDto = {
      title: 'Updated Title',
      description: 'Updated description',
    };

    it('should allow ADMIN to update task', async () => {
      const token = jwtService.sign(mockAdminUser);
      mockTaskQueueService.updateTask.mockResolvedValue({
        success: true,
        data: { ...mockTask, ...updateDto },
      });

      const response = await request(app.getHttpServer())
        .put('/tasks/task-123')
        .set('Authorization', `Bearer ${token}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should allow DISPATCHER to update task', async () => {
      const token = jwtService.sign(mockDispatcherUser);
      mockTaskQueueService.updateTask.mockResolvedValue({
        success: true,
        data: { ...mockTask, ...updateDto },
      });

      await request(app.getHttpServer())
        .put('/tasks/task-123')
        .set('Authorization', `Bearer ${token}`)
        .send(updateDto)
        .expect(200);
    });

    it('should reject TECHNICIAN from updating task', async () => {
      const token = jwtService.sign(mockTechnicianUser);

      await request(app.getHttpServer())
        .put('/tasks/task-123')
        .set('Authorization', `Bearer ${token}`)
        .send(updateDto)
        .expect(403);
    });
  });

  describe('PATCH /tasks/:id/assign (Assign Task)', () => {
    const assignDto = { workerId: 'tech-123' };

    it('should allow ADMIN to assign task', async () => {
      const token = jwtService.sign(mockAdminUser);
      mockTaskQueueService.assignTask.mockResolvedValue({
        success: true,
        data: { ...mockTask, assignedToId: 'tech-123', status: TaskStatus.ASSIGNED },
      });

      const response = await request(app.getHttpServer())
        .patch('/tasks/task-123/assign')
        .set('Authorization', `Bearer ${token}`)
        .send(assignDto)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.assignedToId).toBe('tech-123');
    });

    it('should allow DISPATCHER to assign task', async () => {
      const token = jwtService.sign(mockDispatcherUser);
      mockTaskQueueService.assignTask.mockResolvedValue({
        success: true,
        data: { ...mockTask, assignedToId: 'tech-123' },
      });

      await request(app.getHttpServer())
        .patch('/tasks/task-123/assign')
        .set('Authorization', `Bearer ${token}`)
        .send(assignDto)
        .expect(200);
    });

    it('should reject TECHNICIAN from assigning task', async () => {
      const token = jwtService.sign(mockTechnicianUser);

      await request(app.getHttpServer())
        .patch('/tasks/task-123/assign')
        .set('Authorization', `Bearer ${token}`)
        .send(assignDto)
        .expect(403);
    });
  });

  describe('PATCH /tasks/:id/status (Update Status)', () => {
    it('should allow TECHNICIAN to update status', async () => {
      const token = jwtService.sign(mockTechnicianUser);
      mockTaskQueueService.updateTaskStatus.mockResolvedValue({
        success: true,
        data: { ...mockTask, status: TaskStatus.ACCEPTED },
      });

      const response = await request(app.getHttpServer())
        .patch('/tasks/task-123/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: TaskStatus.ACCEPTED })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should allow DISPATCHER to update status', async () => {
      const token = jwtService.sign(mockDispatcherUser);
      mockTaskQueueService.updateTaskStatus.mockResolvedValue({
        success: true,
        data: { ...mockTask, status: TaskStatus.CANCELED },
      });

      const response = await request(app.getHttpServer())
        .patch('/tasks/task-123/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: TaskStatus.CANCELED })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe(TaskStatus.CANCELED);
    });

    it('should allow ADMIN to update status', async () => {
      const token = jwtService.sign(mockAdminUser);
      mockTaskQueueService.updateTaskStatus.mockResolvedValue({
        success: true,
        data: { ...mockTask, status: TaskStatus.CLOSED },
      });

      await request(app.getHttpServer())
        .patch('/tasks/task-123/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: TaskStatus.CLOSED })
        .expect(200);
    });
  });

  describe('POST /tasks/:id/decline (Decline Task)', () => {
    it('should allow TECHNICIAN to decline task', async () => {
      const token = jwtService.sign(mockTechnicianUser);
      mockTaskQueueService.declineTask.mockResolvedValue({
        success: true,
        data: { ...mockTask, status: TaskStatus.NEW, assignedToId: null },
      });

      const response = await request(app.getHttpServer())
        .post('/tasks/task-123/decline')
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    it('should reject ADMIN from declining task', async () => {
      const token = jwtService.sign(mockAdminUser);

      await request(app.getHttpServer())
        .post('/tasks/task-123/decline')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should reject DISPATCHER from declining task', async () => {
      const token = jwtService.sign(mockDispatcherUser);

      await request(app.getHttpServer())
        .post('/tasks/task-123/decline')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('DELETE /tasks/:id (Delete Task)', () => {
    it('should allow ADMIN to delete task', async () => {
      const token = jwtService.sign(mockAdminUser);
      mockTaskQueueService.deleteTask.mockResolvedValue({
        success: true,
        message: 'Task deleted successfully',
      });

      const response = await request(app.getHttpServer())
        .delete('/tasks/task-123')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject DISPATCHER from deleting task', async () => {
      const token = jwtService.sign(mockDispatcherUser);

      await request(app.getHttpServer())
        .delete('/tasks/task-123')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should reject TECHNICIAN from deleting task', async () => {
      const token = jwtService.sign(mockTechnicianUser);

      await request(app.getHttpServer())
        .delete('/tasks/task-123')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('GET /tasks/:id/timeline (Get Timeline)', () => {
    it('should return task timeline for authorized user', async () => {
      const token = jwtService.sign(mockAdminUser);
      mockTaskService.getTimeline.mockResolvedValue({
        success: true,
        data: [
          { id: 'event-1', eventType: 'CREATED', createdAt: new Date().toISOString() },
          { id: 'event-2', eventType: 'STATUS_CHANGED', createdAt: new Date().toISOString() },
        ],
      });

      const response = await request(app.getHttpServer())
        .get('/tasks/task-123/timeline')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('POST /tasks/:id/comments (Add Comment)', () => {
    const commentDto = { content: 'This is a test comment' };

    it('should allow any role to add comment', async () => {
      const token = jwtService.sign(mockTechnicianUser);
      mockTaskQueueService.addComment.mockResolvedValue({
        success: true,
        data: { id: 'comment-1', content: commentDto.content },
      });

      const response = await request(app.getHttpServer())
        .post('/tasks/task-123/comments')
        .set('Authorization', `Bearer ${token}`)
        .send(commentDto)
        .expect(201);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /tasks/:id/comments (Get Comments)', () => {
    it('should return task comments', async () => {
      const token = jwtService.sign(mockAdminUser);
      mockTaskService.getComments.mockResolvedValue({
        success: true,
        data: [
          { id: 'comment-1', content: 'Comment 1' },
          { id: 'comment-2', content: 'Comment 2' },
        ],
      });

      const response = await request(app.getHttpServer())
        .get('/tasks/task-123/comments')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('GET /tasks/counts (Get Status Counts)', () => {
    it('should return status counts for authorized user', async () => {
      const token = jwtService.sign(mockDispatcherUser);
      mockTaskService.getStatusCounts.mockResolvedValue({
        success: true,
        data: {
          NEW: 5,
          ASSIGNED: 3,
          IN_PROGRESS: 2,
          COMPLETED: 10,
        },
      });

      const response = await request(app.getHttpServer())
        .get('/tasks/counts')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.NEW).toBeDefined();
    });
  });

  describe('Role-Based Access Control', () => {
    it('should enforce RBAC on protected endpoints', async () => {
      const techToken = jwtService.sign(mockTechnicianUser);

      // TECHNICIAN cannot create tasks
      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${techToken}`)
        .send({ title: 'Test' })
        .expect(403);

      // TECHNICIAN cannot delete tasks
      await request(app.getHttpServer())
        .delete('/tasks/task-123')
        .set('Authorization', `Bearer ${techToken}`)
        .expect(403);

      // DISPATCHER cannot delete tasks
      const dispatcherToken = jwtService.sign(mockDispatcherUser);
      await request(app.getHttpServer())
        .delete('/tasks/task-123')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .expect(403);
    });
  });
});
