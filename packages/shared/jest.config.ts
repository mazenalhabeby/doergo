import type { Config } from 'jest';

/**
 * Tests for the shared rules, beside the rules (src/<domain>/__tests__). Before 2026-10-20 the package
 * had none of its own: every rule was tested from inside whichever app happened to use it
 * (docs/plans/code-structure-fix.md, Phase 2.6). `@hbcfield/shared` resolves to this source.
 */
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/src/'],
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }] },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@hbcfield/shared$': '<rootDir>/src',
    '^@hbcfield/shared/(.*)$': '<rootDir>/src/$1',
  },
};

export default config;
