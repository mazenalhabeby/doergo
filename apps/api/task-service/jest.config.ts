import type { Config } from 'jest';

const config: Config = {
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
    '^@doergo/shared$': '<rootDir>/../../../packages/shared/src',
    '^@doergo/shared/(.*)$': '<rootDir>/../../../packages/shared/src/$1',
  },
};

export default config;
