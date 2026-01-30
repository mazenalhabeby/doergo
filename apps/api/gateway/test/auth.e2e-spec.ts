import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { of } from 'rxjs';
import { JwtService, JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { AuthController } from '../src/modules/auth/auth.controller';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let mockAuthClient: { send: jest.Mock; emit: jest.Mock; connect: jest.Mock };
  let jwtService: JwtService;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'ADMIN',
    organizationId: 'org-123',
    platform: 'BOTH',
    canCreateTasks: true,
    canViewAllTasks: true,
    canAssignTasks: true,
    canManageUsers: true,
  };

  const mockTokens = {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
  };

  // Custom JwtAuthGuard that uses local JWT validation for testing
  class TestJwtAuthGuard {
    constructor(
      private reflector: Reflector,
      private jwtSvc: JwtService,
    ) {}

    async canActivate(context: any): Promise<boolean> {
      const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
        context.getHandler(),
        context.getClass(),
      ]);

      if (isPublic) {
        return true;
      }

      const request = context.switchToHttp().getRequest();
      const [type, token] = request.headers.authorization?.split(' ') ?? [];

      if (type !== 'Bearer' || !token) {
        return false;
      }

      try {
        const payload = this.jwtSvc.verify(token);
        request.user = payload;
        return true;
      } catch {
        return false;
      }
    }
  }

  beforeAll(async () => {
    mockAuthClient = {
      send: jest.fn(),
      emit: jest.fn(),
      connect: jest.fn(),
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
      controllers: [AuthController],
      providers: [
        {
          provide: 'AUTH_SERVICE',
          useValue: mockAuthClient,
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

  describe('POST /auth/register', () => {
    const registerDto = {
      email: 'newuser@example.com',
      password: 'Password123!',
      firstName: 'New',
      lastName: 'User',
      companyName: 'Test Org',
    };

    it('should register a new user', async () => {
      mockAuthClient.send.mockReturnValue(
        of({
          success: true,
          data: { ...mockUser, email: registerDto.email },
        }),
      );

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(mockAuthClient.send).toHaveBeenCalledWith(
        { cmd: 'register' },
        expect.objectContaining({
          email: registerDto.email,
          role: 'ADMIN',
        }),
      );
    });

    it('should return 409 for duplicate email', async () => {
      mockAuthClient.send.mockReturnValue(
        of({
          success: false,
          message: 'Email already exists',
          statusCode: 409,
        }),
      );

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(409);

      expect(response.body.message).toBe('Email already exists');
    });

    it('should always set role to ADMIN regardless of input (security)', async () => {
      // Verify that the backend always sets role to ADMIN
      // Note: Extra fields are rejected by validation (forbidNonWhitelisted)
      // This test verifies that registration always creates ADMIN users
      mockAuthClient.send.mockReturnValue(
        of({ success: true, data: mockUser }),
      );

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(201);

      // Verify role is ADMIN in the payload sent to auth service
      expect(mockAuthClient.send).toHaveBeenCalledWith(
        { cmd: 'register' },
        expect.objectContaining({
          role: 'ADMIN',
        }),
      );
    });
  });

  describe('POST /auth/login', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'Password123!',
    };

    it('should login successfully with valid credentials', async () => {
      mockAuthClient.send.mockReturnValue(
        of({
          success: true,
          data: {
            user: mockUser,
            ...mockTokens,
          },
        }),
      );

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
    });

    it('should return 401 for invalid credentials', async () => {
      mockAuthClient.send.mockReturnValue(
        of({
          success: false,
          message: 'Invalid credentials',
          statusCode: 401,
        }),
      );

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 429 when account is locked', async () => {
      mockAuthClient.send.mockReturnValue(
        of({
          success: false,
          message: 'Account is temporarily locked',
          statusCode: 429,
        }),
      );

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(429);

      expect(response.body.message).toBe('Account is temporarily locked');
    });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh token successfully', async () => {
      mockAuthClient.send.mockReturnValue(
        of({
          success: true,
          data: {
            accessToken: 'new-access-token',
            refreshToken: 'new-refresh-token',
          },
        }),
      );

      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBeDefined();
    });

    it('should return 401 for invalid refresh token', async () => {
      mockAuthClient.send.mockReturnValue(
        of({
          success: false,
          message: 'Invalid refresh token',
          statusCode: 401,
        }),
      );

      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);

      expect(response.body.message).toBe('Invalid refresh token');
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout successfully with valid token', async () => {
      const validToken = jwtService.sign(mockUser);

      mockAuthClient.send.mockReturnValue(
        of({ success: true, message: 'Logged out successfully' }),
      );

      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ refreshToken: 'valid-refresh-token' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 403 without auth token', async () => {
      await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken: 'valid-refresh-token' })
        .expect(403);
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('should always return success to prevent email enumeration', async () => {
      mockAuthClient.send.mockReturnValue(
        of({
          success: true,
          message: 'If an account exists, a reset email has been sent',
        }),
      );

      const response = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'test@example.com' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /auth/reset-password', () => {
    it('should reset password with valid token', async () => {
      mockAuthClient.send.mockReturnValue(
        of({
          success: true,
          message: 'Password reset successfully',
        }),
      );

      const response = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({
          token: 'valid-reset-token',
          newPassword: 'NewPassword123!',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 400 for invalid or expired token', async () => {
      mockAuthClient.send.mockReturnValue(
        of({
          success: false,
          message: 'Invalid or expired reset token',
          statusCode: 400,
        }),
      );

      const response = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({
          token: 'invalid-token',
          newPassword: 'NewPassword123!',
        })
        .expect(400);

      expect(response.body.message).toBe('Invalid or expired reset token');
    });
  });

  describe('GET /auth/me', () => {
    it('should return current user profile', async () => {
      const validToken = jwtService.sign(mockUser);

      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(mockUser.id);
      expect(response.body.data.email).toBe(mockUser.email);
    });

    it('should return 403 without auth token', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(403);
    });

    it('should return 403 with invalid token', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(403);
    });

    it('should return 403 with expired token', async () => {
      const expiredToken = jwtService.sign(mockUser, { expiresIn: '-1h' });

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(403);
    });
  });
});
