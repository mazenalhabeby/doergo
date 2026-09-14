import { requireOptionalNativeModule } from 'expo-modules-core';

type LocalAuthenticationLib = typeof import('expo-local-authentication');
type CryptoLib = typeof import('expo-crypto');

/*
  ⚠️ NATIVE LIBRARIES ADDED AFTER A STORE BUILD ARE NEVER IMPORTED AT MODULE SCOPE.

  `expo-local-authentication` and `expo-crypto` call requireNativeModule() the
  moment they are evaluated, which THROWS in a binary built before they were
  added. An over-the-air update reaches every install of the same version —
  including 1.0.5 builds from 10 September that carry neither — so a top-level
  import in the login screen's graph would kill the app at sign-in for those
  people. Same lesson as `lib/biometrics/native.ts` and `offline/native.ts`.

  Presence is asked with the non-throwing API first; the library is `require`d
  only when the answer is yes. The `require` calls stay literal so the bundler
  still includes the libraries.
*/
const cache = new Map<string, unknown>();

function optional<T>(nativeName: string, load: () => T): T | null {
  if (!cache.has(nativeName)) cache.set(nativeName, requireOptionalNativeModule(nativeName) ? load() : null);
  return cache.get(nativeName) as T | null;
}

/** Face ID / fingerprint prompts. Null on a build without it: biometrics are simply not offered. */
export function localAuthentication(): LocalAuthenticationLib | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return optional('ExpoLocalAuthentication', () => require('expo-local-authentication') as LocalAuthenticationLib);
}

/** Random bytes and digests. Null on a build without it. */
export function expoCrypto(): CryptoLib | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return optional('ExpoCrypto', () => require('expo-crypto') as CryptoLib);
}
