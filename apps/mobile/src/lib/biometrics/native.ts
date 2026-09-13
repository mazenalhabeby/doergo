import { NativeModules, TurboModuleRegistry } from 'react-native';

type DeviceKeyLib = typeof import('@sbaiahmed1/react-native-biometrics');

/*
  ⚠️ THE KEY LIBRARY IS NEVER IMPORTED AT MODULE SCOPE. Same lesson as the OCR
  reader (`lib/ocr.ts`), learned again.

  `@sbaiahmed1/react-native-biometrics` binds with
  `TurboModuleRegistry.getEnforcing('ReactNativeBiometrics')` the moment it is
  evaluated, which THROWS in any binary built before the library was added. The
  import sat in the auth context's graph, so the throw landed before React
  mounted: not "biometrics unavailable", the whole app dead — in a dev client
  that predated the dependency, and over the air on every installed store build.

  So: ask the registry with the NON-enforcing `get`, which answers null instead
  of throwing, and only `require` the library once the native side is known to
  be there. A binary without it simply never offers biometric sign-in.
*/
let cached: DeviceKeyLib | null | undefined;

export function deviceKeyModule(): DeviceKeyLib | null {
  if (cached !== undefined) return cached;
  const present =
    TurboModuleRegistry.get('ReactNativeBiometrics') != null ||
    NativeModules.ReactNativeBiometrics != null;
  cached = present ? (require('@sbaiahmed1/react-native-biometrics') as DeviceKeyLib) : null;
  return cached;
}
