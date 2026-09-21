import { NativeModules } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { expoCrypto } from '../lib/optional-native';

type SQLiteLib = typeof import('expo-sqlite');
type NetInfoLib = typeof import('@react-native-community/netinfo');
type ImageManipulatorLib = typeof import('expo-image-manipulator');
type BackgroundTaskLib = typeof import('expo-background-task');

/*
  ⚠️ THE OFFLINE LAYER'S NATIVE PARTS ARE NEVER IMPORTED AT MODULE SCOPE.

  `expo-sqlite` calls requireNativeModule('ExpoSQLite') the moment it is
  evaluated, which THROWS in any binary built before it was added — and every
  store build in people's pockets is such a binary. Imported at the top of a
  file the auth context reaches, an over-the-air update would kill the app on
  launch for everyone (the biometrics module did exactly that).

  So the presence of each native module is asked with the non-throwing APIs,
  and the library is `require`d only after the answer is yes. A binary without
  them runs the app online-only, as it always has.
*/
let sqlite: SQLiteLib | null | undefined;
let netinfo: NetInfoLib | null | undefined;
let manipulator: ImageManipulatorLib | null | undefined;
let backgroundTask: BackgroundTaskLib | null | undefined;

/** Optional: without it the app still syncs on opening, returning and reconnecting. */
export function loadBackgroundTask(): BackgroundTaskLib | null {
  if (backgroundTask !== undefined) return backgroundTask;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  backgroundTask = requireOptionalNativeModule('ExpoBackgroundTask') ? (require('expo-background-task') as BackgroundTaskLib) : null;
  return backgroundTask;
}

/** Optional: without it a photo is kept at the size the camera gave. */
export function loadImageManipulator(): ImageManipulatorLib | null {
  if (manipulator !== undefined) return manipulator;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  manipulator = requireOptionalNativeModule('ExpoImageManipulator') ? (require('expo-image-manipulator') as ImageManipulatorLib) : null;
  return manipulator;
}

export function loadSQLite(): SQLiteLib | null {
  if (sqlite !== undefined) return sqlite;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sqlite = requireOptionalNativeModule('ExpoSQLite') ? (require('expo-sqlite') as SQLiteLib) : null;
  return sqlite;
}

export function loadNetInfo(): NetInfoLib | null {
  if (netinfo !== undefined) return netinfo;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  netinfo = NativeModules.RNCNetInfo ? (require('@react-native-community/netinfo') as NetInfoLib) : null;
  return netinfo;
}

/**
 * Which offline parts this binary is missing — empty means it can run offline.
 *
 * Named rather than counted, because "this version works online only" is true
 * of three different binaries and the answer is not the same for each. A phone
 * reporting 1.0.6 and still refusing to sync is a question nobody could answer
 * from the outside; the phone knows, and now says.
 */
export function missingOfflineParts(): string[] {
  const missing: string[] = [];
  if (loadSQLite() === null) missing.push('expo-sqlite');
  if (loadNetInfo() === null) missing.push('netinfo');
  // expo-crypto names the database file and makes its key.
  if (expoCrypto() === null) missing.push('expo-crypto');
  return missing;
}

/** Can this build run offline at all? Every part, or none. */
export function offlineCapableBuild(): boolean {
  return missingOfflineParts().length === 0;
}
