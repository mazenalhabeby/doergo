/**
 * `@expo/vector-icons` for the rule tests.
 *
 * The helpers under test name icons but never draw one — the type
 * `keyof typeof Ionicons.glyphMap` is the whole dependency. Stubbed rather than
 * pulling jest-expo in for a type, which is the same reason react-native and
 * expo-modules-core are stubbed beside this.
 */
module.exports = { Ionicons: { glyphMap: {} } };
