/**
 * Just enough react-native for rule tests.
 *
 * These files are deliberately React-Native-free plain TypeScript (see
 * jest.config.js), but a module under test may import Platform or Linking at
 * the top level. Stubbing those two is cheaper and far more stable than
 * pulling in jest-expo and its native mocks to assert a boolean.
 */
module.exports = {
  Platform: { OS: 'ios', select: (o) => o.ios ?? o.default },
  // No native modules in a rule test; a spec that needs one mocks its binding.
  NativeModules: {},
  TurboModuleRegistry: { get: () => null },
  Linking: {
    canOpenURL: async () => false,
    openURL: async () => undefined,
  },
};
