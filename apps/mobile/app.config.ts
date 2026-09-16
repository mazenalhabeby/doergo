import { ExpoConfig, ConfigContext } from 'expo/config';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
  The R8 keep rules, kept in a real .pro file rather than inline here.

  ⚠️ THIS THROWS RATHER THAN FALLING BACK TO ''. An unreadable file with a
  graceful fallback means R8 runs with NO keep rules, which builds fine, passes
  every check we can run on this machine, and crashes on a member's phone the
  first time React Native looks up a module by name. A failed build is the only
  acceptable outcome here.
*/
function proguardRules(): string {
  const path = join(__dirname, 'proguard-rules.pro');
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    throw new Error(
      `Cannot read ${path}. R8 is enabled for release builds and must not run without its keep rules. (${String(err)})`,
    );
  }
}

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
    /*
      1.0.6 — offline mode (encrypted local database, background sync, network
      status, image resizing: all NATIVE), one-button clock-in, live presence,
      overtime and forgotten-shift handling, iOS time-sensitive pushes and
      navigation-app detection.

      1.0.5 — the store release carrying the business-card scanner.

      ⚠️ `runtimeVersion` follows this, so bumping it opens a NEW OTA train.
      Updates published from here reach 1.0.5 installs only; anyone still on
      1.0.4 keeps the JS they have and stops receiving updates, which is correct
      — their binary has different native code. Never publish current JS to an
      older train: the older native side crashes on it.
    */
    version: '1.0.6',
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
      /*
        Time Sensitive notifications.

        Without this entitlement a Work Focus or Do Not Disturb silences a push
        outright, and the two notifications this app most needs to deliver — your
        shift has ended, your rest is due — are precisely the ones a member has
        their phone on Focus for. The server marks those `time-sensitive`; iOS
        only honours it when the build carries this.

        Deliberately NOT `critical`, which overrides the ring/silent switch:
        that needs a special entitlement from Apple, is meant for medical and
        safety alarms, and asking for it invites a review problem.

        ⚠️ NATIVE. This reaches phones through a new build, never an OTA.
      */
      entitlements: {
        'com.apple.developer.usernotifications.time-sensitive': true,
      },
      infoPlist: {
        /*
          ⚠️ Without this key Face ID does not work AT ALL — not the prompt, and
          not SecureStore's `requireAuthentication`, which fails with a bare
          error rather than falling back. It is also why Face ID cannot be
          tested in Expo Go: Expo Go's own Info.plist has no reason to carry it.
        */
        NSFaceIDUsageDescription:
          'HBCField uses Face ID so you can sign in without typing your password. Your face never leaves this device.',
        NSLocationWhenInUseUsageDescription:
          'HBCField needs your location to verify you are at your assigned work site when clocking in.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'HBCField uses your location in the background to record your route to an assigned job site while you are on the way, and to verify you remain at your work site while clocked in. Background location stops automatically when you arrive or clock out.',
        NSCameraUsageDescription:
          'HBCField uses the camera to photograph work for task and service reports, and to scan documents you provide to your employer, such as a licence or certificate.',
        NSPhotoLibraryUsageDescription:
          'HBCField uses your photo library to attach images to tasks and service reports, and to submit a document you already have as a photo or scan.',
        UIBackgroundModes: ['remote-notification', 'location'],
        /*
          Which map apps the route planner may ASK about.

          ⚠️ iOS answers `canOpenURL` with false for any scheme not listed
          here — no error, no warning, just "not installed" for everything. So
          without this the planner sees no maps at all and quietly stops
          offering the choice.

          ⚠️ This is NATIVE config: it ships in a BUILD and never in an
          over-the-air update. An OTA carrying the picker to an older binary
          will simply find nothing and open the default handler, which is the
          same behaviour the app had before the picker existed — degraded, not
          broken, on purpose.

          Apple Maps is absent deliberately: it is part of iOS, cannot be
          removed, and is therefore never asked about.
        */
        LSApplicationQueriesSchemes: ['comgooglemaps', 'waze'],
        ITSAppUsesNonExemptEncryption: false,
        /*
          iPhone: portrait only.

          Landscape was declared here so the signing pad could ask iOS to rotate
          the device. That approach is gone — the pad rotates its own view
          inside a portrait window instead, which needs nothing from the OS and
          works the same on both platforms. Declaring an orientation the product
          never wants is an invitation the app would eventually accept: the JS
          policy locks phones to portrait, and the day that lock fails is the
          day the whole phone UI is shown sideways.
        */
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
      /*
        Edge-to-edge: the app draws under the status and navigation bars.

        Stated rather than inherited. SDK 54 already defaults this to true and
        Android 16 (API 36) removes the opt-out entirely, so this line changes
        no bytes today — it pins the intent so a future default cannot quietly
        move it, and it names the thing Play is complaining about at the place
        somebody will look for it.

        ⚠️ IT IS NOT THE FIX FOR PLAY'S WARNING. "Deine App verwendet nicht
        mehr unterstützte APIs oder Parameter für die randlose Anzeige" is
        about CALLS to the deprecated window colour setters, and the two this
        app made were in JavaScript: `NavigationBar.setBackgroundColorAsync` in
        app/_layout.tsx (a no-op under edge-to-edge that only logged a warning)
        and `<StatusBar backgroundColor>` in app/(app)/(tabs)/_layout.tsx,
        which expo-status-bar warns about and then FORWARDS to React Native,
        reaching the deprecated `Window.setStatusBarColor`. Both are gone. What
        paints behind the bars now is the header's own background, drawn under
        a safe-area inset — which is what the platform asks for.
      */
      edgeToEdgeEnabled: true,
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
      // Android package visibility for the route planner's map-app detection.
      // See the plugin for why this is required and what happens without it.
      './plugins/with-nav-app-queries',
      /*
        The biometric permissions. OURS, not the library's — see the plugin for
        why theirs cannot be loaded. Without these the feature silently renders
        nothing on a phone that clearly has a fingerprint reader.
      */
      './plugins/with-biometric-permissions',
      /*
        Says in the manifest that the app resizes and rotates on a large
        screen. Play reads the manifest for this and Expo writes nothing there
        either way; see the plugin for why absent is not the same as declared.
      */
      './plugins/with-large-screen-support',
      /*
        The offline database. SQLCipher, because it holds a copy of the member's
        work — customer addresses, site photos' metadata, their hours — on a
        device that can be lost. NATIVE: only a build carries it; the offline
        layer checks for the module before loading, so an over-the-air update
        to an older build simply stays online-only.
      */
      ['expo-sqlite', { useSQLCipher: true }],
      /*
        Background sync — sending queued work now and then with the app closed.
        Best effort (WorkManager on Android, BGTaskScheduler on iOS) and NATIVE:
        the offline layer checks for the module, so an older build just syncs
        when opened, as before.
      */
      'expo-background-task',
      /*
        The on-device text reader used by the business-card scanner needs iOS
        16. Stated here rather than left to a default, because the failure is a
        build error deep in a pod install rather than anything about OCR.
      */
      [
        'expo-build-properties',
        {
          ios: { deploymentTarget: '16.0' },
          android: {
            /*
              R8 on release builds.

              ⚠️ THE OPTION IS `enableMinifyInReleaseBuilds`, NOT
              `enableProguardInReleaseBuilds`. The Proguard-named key was
              renamed and no longer exists in expo-build-properties 1.0.10;
              passing the old name is accepted silently by the config schema
              and does NOTHING, which looks exactly like a working fix until
              Play reports the same 1% again three months later.

              Without this, R8 never runs: Play measures 1% of the bundle as
              obfuscated against a 25% floor ("Die App-Optimierung liegt unter
              unserem Grenzwert", deadline Feb 2027). Confirmed against the
              last bundle in android-build/: its BUNDLE-METADATA carries a
              d8.json and no obfuscation mapping at all, which is what a D8-only
              build looks like.

              ⚠️ THIS IS THE RISKY ONE. R8 renames and deletes anything it
              cannot see a reference to, and this app reaches for classes by
              NAME in four different ways the compiler cannot follow — the RN
              bridge, Kotlin reflection in expo-modules-core, the manifest, and
              TaskManager's persisted headless-task consumer. proguard-rules.pro
              carries a keep rule and a reason for each. It errs heavily toward
              keeping too much: the threshold is a warning, a stripped class is
              a field outage.
            */
            enableMinifyInReleaseBuilds: true,
            /*
              Resource shrinking. Only meaningful WITH minification — it uses
              R8's reachability analysis to decide which resources nothing
              points at.

              ⚠️ Its blind spot is `Resources.getIdentifier()`, a lookup by
              string. AGP's default "safe" shrink mode detects that call and
              backs off wholesale, and the two resources whose loss would be
              most visible here — the notification icon and the splash image —
              are referenced from the merged manifest and from the splash
              theme, both of which R8 does follow. Still the option most likely
              to produce a cosmetic surprise, and the only way to see it is to
              install the release build.
            */
            enableShrinkResourcesInReleaseBuilds: true,
            /*
              Appended to android/app/proguard-rules.pro. Kept in a real file
              next to this one rather than as a string here, because it is 250
              lines of rules that each need their reason written down.
            */
            extraProguardRules: proguardRules(),
          },
        },
      ],
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
