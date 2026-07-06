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
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    scheme: 'hbcfield',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#09090b',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.hbcfield.app',
      // Seed for EAS remote versioning (appVersionSource: "remote").
      // Only used to initialize the remote counter on the first remote build;
      // EAS manages/increments the real build number after that.
      buildNumber: '5',
      config: {
        googleMapsApiKey,
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          'HBCField needs your location to verify you are at your assigned work site when clocking in.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'HBCField uses your location in the background while you are clocked in to verify you remain at your assigned work site. Location tracking stops automatically when you clock out.',
        NSCameraUsageDescription:
          'HBCField needs camera access to take photos for task documentation',
        NSPhotoLibraryUsageDescription:
          'HBCField needs photo library access to attach images to tasks and service reports',
        UIBackgroundModes: ['remote-notification', 'location'],
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#1e293b',
      },
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
      package: 'com.hbcfield.app',
      // Seed for EAS remote versioning (see iOS buildNumber note above).
      versionCode: 4,
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
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
      ],
    },
    plugins: [
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
