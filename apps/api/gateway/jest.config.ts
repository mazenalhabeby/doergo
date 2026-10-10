import { apiJestConfig } from '../jest.base';

// The gateway also runs its HTTP e2e specs (test/), with their setup file.
export default apiJestConfig({
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  roots: ['<rootDir>/src/', '<rootDir>/test/'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
});
