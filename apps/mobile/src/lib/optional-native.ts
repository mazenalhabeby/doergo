import { requireOptionalNativeModule } from 'expo-modules-core';

type LocalAuthenticationLib = typeof import('expo-local-authentication');
type CryptoLib = typeof import('expo-crypto');
type DocumentPickerLib = typeof import('expo-document-picker');
type ContactsLib = typeof import('expo-contacts');
type ImageLib = typeof import('expo-image');

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

/**
 * Picking a PDF off the phone. Null on a build without it — the caller then
 * offers photographs only.
 *
 * ⚠️ Added here after `asset-expense.tsx` imported it at module scope and took
 * its whole ROUTE down on a binary that predates it: expo-router imports every
 * route while building the tree, so the throw happened at launch and the route
 * simply never registered. `native-imports.spec.ts` now names this library, so
 * the next static import fails the suite instead of a member's app.
 */
export function documentPicker(): DocumentPickerLib | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return optional('ExpoDocumentPicker', () => require('expo-document-picker') as DocumentPickerLib);
}

/**
 * The phone's address book, for the contacts import. Null on a build without
 * it (1.0.7 and older) — the import is then simply not offered.
 */
export function expoContacts(): ContactsLib | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return optional('ExpoContacts', () => require('expo-contacts') as ContactsLib);
}

/**
 * expo-image — avatars with a memory + disk cache. In package.json since
 * 2026-07-31, so every store build the OTA trains reach carries it; asked
 * first anyway, because `expo-image` binds `ExpoImage` (module AND view) the
 * moment it is evaluated. Null: the caller draws React Native's own Image.
 */
export function expoImage(): ImageLib | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return optional('ExpoImage', () => require('expo-image') as ImageLib);
}
