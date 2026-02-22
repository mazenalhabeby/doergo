import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { HttpStatus } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Role, Platform, BCRYPT_COST_FACTOR } from '@doergo/shared';

// Mock bcrypt
jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: jest.Mocked<PrismaService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    firstName: 'John',
    lastName: 'Doe',
    role: Role.ADMIN,
    platform: Platform.BOTH,
    organizationId: 'org-123',
    failedLoginAttempts: 0,
    lockedUntil: null,
    isActive: true,
    canCreateTasks: true,
    canViewAllTasks: true,
    canAssignTasks: true,
    canManageUsers: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    organization: {
      id: 'org-123',
      name: 'Test Org',
    },
  };

  const mockPrismaService: Record<string, any> = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    organization: {
      create: jest.fn(),
    },
    refreshToken: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((callback: (prisma: Record<string, any>) => any) => callback(mockPrismaService)),
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        JWT_ACCESS_SECRET: 'test-access-secret',
        JWT_REFRESH_SECRET: 'test-refresh-secret',
        JWT_ACCESS_EXPIRATION: '15m',
        JWT_REFRESH_EXPIRATION: '7d',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get(PrismaService);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);
  });

  describe('register', () => {
    const registerData = {
      email: 'newuser@example.com',
      password: 'StrongPass123',
      firstName: 'Jane',
      lastName: 'Smith',
      role: 'ADMIN',
      companyName: 'New Company',
    };

    it('should register a new user successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.organization.create.mockResolvedValue({
        id: 'new-org-123',
        name: 'new company',
        isActive: true,
      });
      mockPrismaService.user.create.mockResolvedValue({
        ...mockUser,
        id: 'new-user-123',
        email: 'newuser@example.com',
      });
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');

      const result = await service.register(registerData);

      expect(result.success).toBe(true);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'newuser@example.com' },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(registerData.password, BCRYPT_COST_FACTOR);
    });

    it('should return error if email already exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.register(registerData);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.CONFLICT);
      expect(result.message).toContain('already exists');
    });

    it('should normalize email to lowercase', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.organization.create.mockResolvedValue({ id: 'org-1', name: 'test', isActive: true });
      mockPrismaService.user.create.mockResolvedValue(mockUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');

      await service.register({
        ...registerData,
        email: 'TEST@EXAMPLE.COM',
      });

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });

    it('should force role to ADMIN regardless of input', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.organization.create.mockResolvedValue({ id: 'org-1', name: 'test', isActive: true });
      mockPrismaService.user.create.mockResolvedValue(mockUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');

      await service.register({
        ...registerData,
        role: 'TECHNICIAN', // Try to pass different role
      });

      expect(mockPrismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: Role.ADMIN, // Should always be ADMIN
          }),
        }),
      );
    });
  });

  describe('login', () => {
    const loginData = {
      email: 'test@example.com',
      password: 'password123',
      rememberMe: false,
    };

    it('should login successfully with valid credentials', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue('mock-token');
      mockPrismaService.refreshToken.count.mockResolvedValue(0);
      mockPrismaService.refreshToken.create.mockResolvedValue({ id: 'token-1' });

      const result = await service.login(loginData);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('accessToken');
      expect(result.data).toHaveProperty('refreshToken');
      expect(result.data?.user.email).toBe(mockUser.email);
    });

    it('should return error for invalid email', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.login(loginData);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('should return error for invalid password', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      mockPrismaService.user.update.mockResolvedValue(mockUser);

      const result = await service.login(loginData);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('should increment failed login attempts on wrong password', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      mockPrismaService.user.update.mockResolvedValue(mockUser);

      await service.login(loginData);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { failedLoginAttempts: 1 },
      });
    });

    it('should lock account after 5 failed attempts', async () => {
      const userWith4Failures = { ...mockUser, failedLoginAttempts: 4 };
      mockPrismaService.user.findUnique.mockResolvedValue(userWith4Failures);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      mockPrismaService.user.update.mockResolvedValue(userWith4Failures);

      await service.login(loginData);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failedLoginAttempts: 5,
            lockedUntil: expect.any(Date),
          }),
        }),
      );
    });

    it('should reject login for locked account', async () => {
      const lockedUser = {
        ...mockUser,
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes from now
      };
      mockPrismaService.user.findUnique.mockResolvedValue(lockedUser);

      const result = await service.login(loginData);

      expect(result.success).toBe(false);
      expect(result.message).toContain('locked');
    });

    it('should unlock account after lockout period expires', async () => {
      const previouslyLockedUser = {
        ...mockUser,
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() - 1000), // Expired 1 second ago
      };
      mockPrismaService.user.findUnique.mockResolvedValue(previouslyLockedUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue('mock-token');
      mockPrismaService.refreshToken.count.mockResolvedValue(0);
      mockPrismaService.refreshToken.create.mockResolvedValue({ id: 'token-1' });

      const result = await service.login(loginData);

      expect(result.success).toBe(true);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failedLoginAttempts: 0,
            lockedUntil: null,
          }),
        }),
      );
    });

    it('should normalize email to lowercase on login', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue('mock-token');
      mockPrismaService.refreshToken.count.mockResolvedValue(0);
      mockPrismaService.refreshToken.create.mockResolvedValue({ id: 'token-1' });

      await service.login({
        ...loginData,
        email: 'TEST@EXAMPLE.COM',
      });

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: 'test@example.com' },
        }),
      );
    });
  });

  describe('refresh', () => {
    const mockRefreshTokenRecord = {
      id: 'refresh-token-123',
      tokenHash: 'hashed-token',
      userId: mockUser.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      usedAt: null,
      replacedByTokenHash: null,
      cachedAccessToken: null,
      cachedRefreshToken: null,
      user: mockUser,
    };

    it('should refresh token successfully with valid refresh token', async () => {
      mockPrismaService.refreshToken.findFirst.mockResolvedValue(mockRefreshTokenRecord);
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('new-access-token');
      mockPrismaService.refreshToken.update.mockResolvedValue(mockRefreshTokenRecord);
      mockPrismaService.refreshToken.create.mockResolvedValue({ id: 'new-refresh' });

      const result = await service.refresh('valid-token');

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('accessToken');
      expect(result.data).toHaveProperty('refreshToken');
    });

    it('should reject expired refresh token', async () => {
      const expiredToken = {
        ...mockRefreshTokenRecord,
        expiresAt: new Date(Date.now() - 1000), // Expired
      };
      mockPrismaService.refreshToken.findFirst.mockResolvedValue(expiredToken);

      const result = await service.refresh('expired-token');

      expect(result.success).toBe(false);
      expect(result.message).toContain('expired');
    });

    it('should reject already-used refresh token', async () => {
      const usedToken = {
        ...mockRefreshTokenRecord,
        usedAt: new Date(),
      };
      mockPrismaService.refreshToken.findFirst.mockResolvedValue(usedToken);

      const result = await service.refresh('used-token');

      expect(result.success).toBe(false);
    });

    it('should reject invalid refresh token', async () => {
      mockPrismaService.refreshToken.findFirst.mockResolvedValue(null);

      const result = await service.refresh('invalid-token');

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('logout', () => {
    it('should invalidate refresh token on logout', async () => {
      mockPrismaService.refreshToken.findFirst.mockResolvedValue({
        id: 'token-123',
        tokenHash: 'hashed',
        usedAt: null,
      });
      mockPrismaService.refreshToken.update.mockResolvedValue({});

      const result = await service.logout('valid-token');

      expect(result.success).toBe(true);
      expect(mockPrismaService.refreshToken.update).toHaveBeenCalled();
    });

    it('should return success even if token not found', async () => {
      mockPrismaService.refreshToken.findFirst.mockResolvedValue(null);

      const result = await service.logout('invalid-token');

      expect(result.success).toBe(true);
    });
  });

  describe('password hashing', () => {
    it('should use bcrypt with cost factor 12', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.organization.create.mockResolvedValue({ id: 'org-1', name: 'test', isActive: true });
      mockPrismaService.user.create.mockResolvedValue(mockUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');

      await service.register({
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
        role: 'ADMIN',
        companyName: 'Test Co',
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 12);
    });
  });
});
