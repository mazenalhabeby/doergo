import { NativeModules } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

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

/** Can this build run offline at all? Both parts, or neither. */
export function offlineCapableBuild(): boolean {
  return loadSQLite() !== null && loadNetInfo() !== null;
}
