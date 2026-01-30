import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s', '!src/**/*.module.ts', '!src/main.ts'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/', '<rootDir>/test/'],
  moduleNameMapper: {
    '^@doergo/shared$': '<rootDir>/../../../packages/shared/src',
    '^@doergo/shared/(.*)$': '<rootDir>/../../../packages/shared/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
};

export default config;
