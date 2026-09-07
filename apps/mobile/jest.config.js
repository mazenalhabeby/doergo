/**
 * Tests for the app's RULES, not its screens.
 *
 * The mobile app had no runner at all, so every permission decision it makes —
 * which rows a member sees, whether a route can be planned, whether a grant
 * held in one space counts — was verified by typecheck and by eye. These files
 * are deliberately React-Native-free plain TypeScript, so they need no
 * `jest-expo`, no native mocks and no new dependency: ts-jest and jest are
 * already in the workspace.
 *
 * Rendering tests would need the Expo preset and are a separate decision.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/__tests__/**/*.spec.ts'],
  moduleNameMapper: {
    '^@hbcfield/shared/client$': '<rootDir>/../../packages/shared/dist/client.js',
    // These specs test RULES, not rendering, so react-native is stubbed rather
    // than dragging in jest-expo and a native mock stack for two symbols.
    '^react-native$': '<rootDir>/src/lib/__tests__/react-native.stub.js',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs', esModuleInterop: true, strict: false } }],
  },
};
