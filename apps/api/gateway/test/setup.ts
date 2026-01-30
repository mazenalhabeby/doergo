// Jest test setup for Gateway E2E tests
import { Test, TestingModule } from '@nestjs/testing';

// Increase timeout for E2E tests
jest.setTimeout(30000);

// Global test utilities
export async function createTestingModule(metadata: any): Promise<TestingModule> {
  return Test.createTestingModule(metadata).compile();
}

// Mock Redis client for tests
export const mockRedisClient = {
  send: jest.fn().mockImplementation(() => ({
    toPromise: jest.fn().mockResolvedValue({}),
  })),
  emit: jest.fn(),
  connect: jest.fn(),
  close: jest.fn(),
};

// Mock Prisma for tests
export const mockPrismaService: any = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  task: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  refreshToken: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn((callback) => callback(mockPrismaService)),
};
