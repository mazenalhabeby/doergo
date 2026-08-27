import { ExpoConfig, ConfigContext } from 'expo/config';
import { execSync } from 'node:child_process';

// Resolve the git commit this build was made from.
// On EAS, `EAS_BUILD_GIT_COMMIT_HASH` is injected automatically.
// Locally (dev client / Metro), fall back to the working-tree HEAD.
function resolveGitCommit(): string {
  const easCommit = process.env.EAS_BUILD_GIT_COMMIT_HASH;
  if (easCommit) return easCommit.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  const gitCommit = resolveGitCommit();
  const buildProfile = process.env.EAS_BUILD_PROFILE ?? 'local';
  const builtAt = new Date().toISOString();

  return {
    ...config,
    name: 'HBCField',
    slug: 'doergo',
    version: '1.0.2',
    // 'default' allows landscape on tablets. Phones are kept portrait so their
    // phone-first UI is never shown rotated: iPhone via the idiom-specific
    // infoPlist keys below, Android phones via a runtime lock in the root layout.
    orientation: 'default',
    icon: './assets/icon.png',
    scheme: 'hbcfield',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    // EAS Update (OTA). Runtime version derives from the app `version` above.
    // JS-only changes ship over-the-air to builds with the same version; when you
    // make a NATIVE change (new lib, permission, config), bump `version` so the new
    // build gets a fresh runtime version and old OTA payloads can't reach it.
    // (Using appVersion, not fingerprint: fingerprint mis-computes on EAS for
    // managed/prebuild projects — native dirs exist post-prebuild but not locally.)
    runtimeVersion: { policy: 'appVersion' },
    updates: {
      url: 'https://u.expo.dev/e0202344-e599-46e0-b546-2f07ac5b6131',
    },
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#09090b',
    },
    ios: {
      // Native iPad support. NOTE: App Store Connect now requires a full set of
      // 12.9" iPad screenshots to submit.
      supportsTablet: true,
      bundleIdentifier: 'com.hbcfield.app',
      // No buildNumber / versionCode here on purpose. appVersionSource is
      // "remote", so EAS owns those counters (currently iOS 12, Android 11) and
      // ignores whatever this file says — a number here would only be a stale
      // one that reads as authoritative. It still reaches the manifest via
      // expo-constants, which is how it misleads.
      config: {
        googleMapsApiKey,
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          'HBCField needs your location to verify you are at your assigned work site when clocking in.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'HBCField uses your location in the background to record your route to an assigned job site while you are on the way, and to verify you remain at your work site while clocked in. Background location stops automatically when you arrive or clock out.',
        NSCameraUsageDescription:
          'HBCField needs camera access to take photos for task documentation',
        NSPhotoLibraryUsageDescription:
          'HBCField needs photo library access to attach images to tasks and service reports',
        UIBackgroundModes: ['remote-notification', 'location'],
        ITSAppUsesNonExemptEncryption: false,
        // iPhone: portrait only (phone-first UI). iPad: all orientations.
        UISupportedInterfaceOrientations: ['UIInterfaceOrientationPortrait'],
        // iPad: portrait + both landscapes, but NOT upside-down (rarely wanted).
        'UISupportedInterfaceOrientations~ipad': [
          'UIInterfaceOrientationPortrait',
          'UIInterfaceOrientationLandscapeLeft',
          'UIInterfaceOrientationLandscapeRight',
        ],
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#1e293b',
      },
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
      package: 'com.hbcfield.app',
      config: {
        googleMaps: {
          apiKey: googleMapsApiKey,
        },
      },
      permissions: [
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_BACKGROUND_LOCATION',
        'android.permission.CAMERA',
      ],
    },
    plugins: [
      // Play In-App Updates (Android). No-ops on iOS — Apple has no equivalent.
      'expo-in-app-updates',
      'expo-router',
      ['expo-location', { isIosBackgroundLocationEnabled: true, isAndroidBackgroundLocationEnabled: true }],
      'expo-camera',
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: '#059669',
        },
      ],
      'expo-secure-store',
      'expo-font',
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: 'e0202344-e599-46e0-b546-2f07ac5b6131',
      },
      gitCommit,
      buildProfile,
      builtAt,
    },
  };
};
