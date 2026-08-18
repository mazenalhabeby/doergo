import type { Config } from 'jest'
import nextJest from 'next/jest.js'

// next/jest wires the SWC transform, tsconfig path aliases, CSS/asset stubs and
// .env loading for us — so the config below only has to say what to run. Same
// runner and *.spec.ts convention as the API services, so `pnpm test` at the
// root covers the whole monorepo.
const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  rootDir: '.',
  roots: ['<rootDir>/src/'],
  testRegex: '.*\\.spec\\.tsx?$',
  // jsdom, not node: some units under test build React elements.
  testEnvironment: 'jsdom',
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  coverageDirectory: './coverage',
  moduleNameMapper: {
    '^@hbcfield/shared$': '<rootDir>/../../packages/shared/src',
    '^@hbcfield/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
  },
}

export default createJestConfig(config)
