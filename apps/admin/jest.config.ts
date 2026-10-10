import type { Config } from 'jest';
import nextJest from 'next/jest.js';

// The web app's setup (next/jest: SWC transform, tsconfig paths), so `pnpm test`
// at the root runs the console's specs too. Node, not jsdom: nothing here
// renders; the specs give the client a window of their own.
const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  rootDir: '.',
  testRegex: '.*\\.spec\\.tsx?$',
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // The shared package's source, as the web app's specs read it — no build needed to test.
    '^@hbcfield/shared$': '<rootDir>/../../packages/shared/src',
    '^@hbcfield/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
  },
};

export default createJestConfig(config);
