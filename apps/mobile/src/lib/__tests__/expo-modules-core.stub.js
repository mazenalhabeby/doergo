/**
 * Just enough expo-modules-core for rule tests.
 *
 * `requireOptionalNativeModule` returns null when a native module is absent,
 * which in a node test environment is always — and that is precisely the case
 * worth testing: it is what every production binary built before the scanner
 * will see.
 */
module.exports = {
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => {
    throw new Error('Cannot find native module');
  },
  // A permission hook is a React hook; rule tests never render one, they only load the file.
  createPermissionHook: () => () => [null, async () => null, async () => null],
};
