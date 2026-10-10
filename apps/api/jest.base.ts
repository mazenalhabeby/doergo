import type { Config } from 'jest';

/**
 * The jest setup every API service runs with. Five services carried this file
 * word for word; each `jest.config.ts` now states only how it differs.
 *
 * `@hbcfield/shared` resolves to its SOURCE, so a test exercises the shared rule
 * as written rather than a stale `dist/`.
 */
export function apiJestConfig(overrides: Partial<Config> = {}): Config {
  return {
    moduleFileExtensions: ['js', 'json', 'ts'],
    rootDir: '.',
    testRegex: '.*\\.spec\\.ts$',
    transform: {
      '^.+\\.(t|j)s$': 'ts-jest',
    },
    collectCoverageFrom: ['src/**/*.(t|j)s', '!src/**/*.module.ts', '!src/main.ts'],
    coverageDirectory: './coverage',
    testEnvironment: 'node',
    roots: ['<rootDir>/src/'],
    moduleNameMapper: {
      '^@hbcfield/shared$': '<rootDir>/../../../packages/shared/src',
      '^@hbcfield/shared/(.*)$': '<rootDir>/../../../packages/shared/src/$1',
    },
    ...overrides,
  };
}
