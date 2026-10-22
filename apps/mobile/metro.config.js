// Metro, as Expo configures it — plus tree-shaking, OFF unless a build asks for it (6.5).
//
// A build turns it on with EXPO_UNSTABLE_TREE_SHAKING=1 and EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1 (add
// both to the eas.json `production` env for the store build that ships it). It needs ESM imports
// kept as imports through the transform (`experimentalImportSupport`), which changes how modules are linked at runtime — so it
// is tied to the same flag: `expo start`, tests and an `eas update` without the flag bundle exactly
// as before. ⚠️ Ship it in a STORE build tested on a device first, never as a surprise OTA.
// Measured 2026-10-22 (Android, Hermes): 10,955,712 → 10,366,426 bytes (−5.4 %).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (process.env.EXPO_UNSTABLE_TREE_SHAKING === '1') {
  config.transformer.getTransformOptions = async () => ({
    transform: {
      experimentalImportSupport: true,
      inlineRequires: true,
    },
  });
}

module.exports = config;
