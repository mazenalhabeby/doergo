import { i18nReady } from '../src/i18n';
import 'react-native-gesture-handler';
// Register background tasks (must be at top level before any component renders)
import '../src/services/background-heartbeat';
// Defines the background sync task at startup — the OS may start the app for it alone.
import '../src/offline/background-sync';
import { useEffect, useState, useCallback, useRef } from 'react';
import { LogBox, type ErrorUtils as RNErrorUtils } from 'react-native';
import { caught } from '../src/lib/caught';

// Suppress noisy "Session expired" unhandled rejections — auth context handles redirect
const errorUtils = (global as { ErrorUtils?: RNErrorUtils }).ErrorUtils;
const originalHandler = errorUtils?.getGlobalHandler?.();
if (errorUtils) {
  errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    if (caught(error).message?.includes('Session expired')) return;
    originalHandler?.(error, isFatal);
  });
}
LogBox.ignoreLogs(['Session expired']);
import { Stack, useRouter, useSegments, Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, Platform } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import * as NavigationBar from 'expo-navigation-bar';
import { useFonts, Outfit_400Regular, Outfit_800ExtraBold } from '@expo-google-fonts/outfit';
/* v2 — Amazen Trust. Readex Pro for everything, IBM Plex Mono for numerals
   that are read digit by digit: times, durations, ids, amounts in rows. Never
   prose. See `src/theme/amazen.ts`. */
import { ReadexPro_300Light, ReadexPro_400Regular, ReadexPro_500Medium } from '@expo-google-fonts/readex-pro';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import { AuthProvider, useAuth } from '../src/contexts/auth-context';
import { AppQueryProvider } from '../src/contexts/query-provider';
import { ThemeProvider, useTheme } from '../src/contexts/theme-context';
import { IslandProvider } from '../src/island/island-context';
import { UpdateRequired } from '../src/components/update-required';
import { UpdateBanner } from '../src/components/update-banner';
import { UpdatePage } from '../src/components/update-page';
import { VersionProvider, useVersionStatus } from '../src/contexts/version-context';
import { AnimatedSplash } from '../src/components/animated-splash';
import { ErrorBoundary } from '../src/components/error-boundary';
import { LocationConsentModal } from '../src/components/LocationConsentModal';
import { applyOrientationPolicy } from '../src/lib/orientation';
import { IslandStatusBar } from '../src/island/island-status-bar';

// Keep the native splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync().catch(() => {});

function RootLayoutNav() {
  const { isAuthenticated, isLoading, needsOnboarding, user } = useAuth();
  const { isDark } = useTheme();
  const segments = useSegments();
  const router = useRouter();
  const [showAnimatedSplash, setShowAnimatedSplash] = useState(true);
  const [appIsReady, setAppIsReady] = useState(false);
  const [splashHidden, setSplashHidden] = useState(false);

  // Hide native splash when auth state is loaded (only once)
  const hidingRef = useRef(false);
  useEffect(() => {
    if (isLoading || splashHidden || hidingRef.current) return;
    hidingRef.current = true;
    SplashScreen.hideAsync()
      .catch(() => {}) // Ignore if already hidden or not registered
      .finally(() => {
        setSplashHidden(true);
        setAppIsReady(true);
      });
  }, [isLoading, splashHidden]);

  /*
    The Android navigation bar's BUTTON contrast — light icons on the dark
    splash, theme-matched icons afterwards.

    ⚠️ The paired `setBackgroundColorAsync` calls were removed. Under
    edge-to-edge the navigation bar is transparent and the app draws behind it,
    so expo-navigation-bar returns early from that call and logs a warning on
    every theme change; it never reached the deprecated `setNavigationBarColor`
    the Play Console flags, but keeping a call that can only warn invites
    somebody to "fix" it by opting out of edge-to-edge. What shows through the
    bar is the screen's own background, which is what `colors.surface` was
    trying to paint anyway.

    `setButtonStyleAsync` is the one that still does something: it maps to
    WindowInsetsController's appearance flags, which is the supported API.
  */
  useEffect(() => {
    if (Platform.OS === 'android') {
      NavigationBar.setButtonStyleAsync(!appIsReady || showAnimatedSplash ? 'light' : isDark ? 'light' : 'dark');
    }
  }, [appIsReady, showAnimatedSplash, isDark]);

  // Handle navigation after auth state changes (3-way: auth → onboarding → app)
  useEffect(() => {
    if (isLoading || showAnimatedSplash) return;

    const firstSegment = segments[0] as string | undefined;
    // Dev-only splash recording route — never redirect away from it.
    if (firstSegment === 'splash-preview') return;
    const inAuthGroup = firstSegment === '(auth)';
    const inAppGroup = firstSegment === '(app)';
    const inOnboardingGroup = firstSegment === '(onboarding)';
    const inCustomerGroup = firstSegment === '(customer)';
    // External customers get a wholly separate stack (portal). They are born
    // onboardingCompleted=true, so they never see the org-builder or staff app.
    const isCustomer = user?.role === 'CUSTOMER';

    if (isAuthenticated && needsOnboarding && !inOnboardingGroup) {
      // Authenticated but needs onboarding → onboarding wizard
      router.replace('/(onboarding)/choose-path' as Href);
    } else if (isAuthenticated && !needsOnboarding && isCustomer && !inCustomerGroup) {
      // Customer → customer portal (never the staff app)
      router.replace('/(customer)' as Href);
    } else if (
      isAuthenticated &&
      !needsOnboarding &&
      !isCustomer &&
      (inAuthGroup || inOnboardingGroup || inCustomerGroup || !firstSegment)
    ) {
      // Staff (admin/employee), onboarded → main app
      router.replace('/(app)' as Href);
    } else if (!isAuthenticated && (inAppGroup || inOnboardingGroup || inCustomerGroup || !firstSegment)) {
      // Not authenticated → login
      router.replace('/(auth)/login' as Href);
    }
  }, [isAuthenticated, needsOnboarding, isLoading, segments, showAnimatedSplash, user?.role]);

  /*
    Is this build still allowed to run, and is there a newer one?

    Starts as null meaning "not answered yet", and only a definite
    `blocked: true` shows the wall — every failure inside checkVersion resolves
    to blocked:false, so a timeout or an older API cannot lock anyone out of a
    working app.

    ⚠️ This was a once-per-launch `checkVersion()` here, which is how the 1.0.5
    release went unannounced: `MOBILE_LATEST_VERSION` is raised the moment the
    store publishes, and every app already open had asked BEFORE that and been
    told nothing was new. The provider re-asks on foreground.
  */
  const { status: versionStatus } = useVersionStatus();
  // While the update page is open the banner stays out of the way. Above every early return: hooks.
  const [updatePageOpen, setUpdatePageOpen] = useState(false);

  const handleSplashComplete = useCallback(() => {
    setShowAnimatedSplash(false);
  }, []);

  // Show animated splash while loading or during splash animation
  if (!appIsReady || showAnimatedSplash) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <AnimatedSplash onAnimationComplete={handleSplashComplete} />
      </View>
    );
  }

  // Nothing else renders when the build is too old — no dismiss, no "later".
  // "Later" is how a sideloaded phone stays on a two-year-old release.
  if (versionStatus?.blocked) {
    return (
      <View style={styles.container}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <UpdateRequired status={versionStatus} />
      </View>
    );
  }

  return (
    /*
      ⚠️ NO `isDark`. The island is black in both themes and so is its ink —
      it is pretending to be the camera housing, and the housing is black on a
      white phone too. See `island/tokens.ts`.
    */
    <IslandProvider>
      {/*
        ⚠️ THE APP'S THEME, NOT THE PHONE'S — AND ONLY ONE OF THESE IN THE TREE.

        Two bugs lived here. `style="auto"` reads the OS colour scheme, while
        the Android navigation-bar effect above reads `isDark`, which is the
        APP's theme — so a member who pins the app to Light while the phone is
        in Dark got light icons on a light header, invisible, with the
        navigation bar at the other end of the screen correctly dark.

        And `(app)/(tabs)/_layout.tsx` mounted a SECOND `<StatusBar>` with a
        different opinion. Both were mounted at once, both write the same
        global on every render, and which one landed was commit order — so the
        icon colour on the tab screens was undefined whenever the two
        disagreed, which is exactly the pinned-theme case above.

        (The `StatusBarModule: Ignored status bar change` lines in logcat are
        NOT from this: expo-status-bar always sends a background colour, and
        Android drops it under edge-to-edge. Removing the duplicate does not
        reduce them, and they are harmless.)

        One component, one source of truth. Screens with a fixed dark hero
        (login, onboarding) still override it locally; they mount deeper and
        are unmounted again when they close.

        (And it has one more thing to consider now — a black visor at the top
        edge makes dark icons vanish in light mode. §5.5 of the island spec;
        the flag comes from the provider, still through this one component.)
      */}
      <IslandStatusBar isDark={isDark} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="(customer)" />
        <Stack.Screen name="splash-preview" />
      </Stack>
      {/* Everyone hears about a new version — without anyone losing the app.
          Raising the minimum blocks every older build the instant it is set,
          and if the store has not published yet those people are locked out of
          something that works. This says the same thing and costs nobody. */}
      {versionStatus && !updatePageOpen && <UpdateBanner status={versionStatus} />}
      {/* Once a day, a page of its own; "Later" and the app carries on as it is. */}
      {versionStatus && <UpdatePage status={versionStatus} onVisibleChange={setUpdatePageOpen} />}
      {/* Prominent background-location disclosure — overlays the app when a
          background service needs consent (Google Play requirement). */}
      <LocationConsentModal />
    </IslandProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_800ExtraBold,
    ReadexPro_300Light,
    ReadexPro_400Regular,
    ReadexPro_500Medium,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });
  const [langLoaded, setLangLoaded] = useState(false);

  useEffect(() => {
    i18nReady.then(() => setLangLoaded(true));
    // Tablets rotate freely; phones are locked to portrait.
    applyOrientationPolicy();
  }, []);

  if (!fontsLoaded || !langLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <ThemeProvider>
            <AuthProvider>
              {/* Above the navigator, so the banner and the entry in Profile
                  read one answer to one question. */}
              <AppQueryProvider>
                <VersionProvider>
                  <RootLayoutNav />
                </VersionProvider>
              </AppQueryProvider>
            </AuthProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
});
