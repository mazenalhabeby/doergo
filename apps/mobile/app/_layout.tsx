import { i18nReady } from '../src/i18n';
import 'react-native-gesture-handler';
// Register background tasks (must be at top level before any component renders)
import '../src/services/background-heartbeat';
import { useEffect, useState, useCallback, useRef } from 'react';
import { LogBox } from 'react-native';

// Suppress noisy "Session expired" unhandled rejections — auth context handles redirect
const originalHandler = (global as any).ErrorUtils?.getGlobalHandler?.();
if ((global as any).ErrorUtils) {
  (global as any).ErrorUtils.setGlobalHandler((error: any, isFatal: boolean) => {
    if (error?.message?.includes('Session expired')) return;
    originalHandler?.(error, isFatal);
  });
}
LogBox.ignoreLogs(['Session expired']);
import { Stack, useRouter, useSegments, Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import * as NavigationBar from 'expo-navigation-bar';
import { useFonts, Outfit_400Regular, Outfit_800ExtraBold } from '@expo-google-fonts/outfit';
import { AuthProvider, useAuth } from '../src/contexts/auth-context';
import { ThemeProvider, useTheme } from '../src/contexts/theme-context';
import { ToastProvider } from '../src/contexts/toast-context';
import { AnimatedSplash } from '../src/components';
import { ErrorBoundary } from '../src/components/error-boundary';
import { LocationConsentModal } from '../src/components/LocationConsentModal';

// Keep the native splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync().catch(() => {});

function RootLayoutNav() {
  const { isAuthenticated, isLoading, needsOnboarding } = useAuth();
  const { colors, isDark } = useTheme();
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

  // Configure Android navigation bar based on current screen and theme
  useEffect(() => {
    if (Platform.OS === 'android') {
      if (!appIsReady || showAnimatedSplash) {
        NavigationBar.setBackgroundColorAsync('#09090b');
        NavigationBar.setButtonStyleAsync('light');
      } else {
        NavigationBar.setBackgroundColorAsync(colors.surface);
        NavigationBar.setButtonStyleAsync(isDark ? 'light' : 'dark');
      }
    }
  }, [appIsReady, showAnimatedSplash, colors.surface, isDark]);


  // Handle navigation after auth state changes (3-way: auth → onboarding → app)
  useEffect(() => {
    if (isLoading || showAnimatedSplash) return;

    const firstSegment = segments[0] as string | undefined;
    // Dev-only splash recording route — never redirect away from it.
    if (firstSegment === 'splash-preview') return;
    const inAuthGroup = firstSegment === '(auth)';
    const inAppGroup = firstSegment === '(app)';
    const inOnboardingGroup = firstSegment === '(onboarding)';

    if (isAuthenticated && needsOnboarding && !inOnboardingGroup) {
      // Authenticated but needs onboarding → onboarding wizard
      router.replace('/(onboarding)/choose-path' as Href);
    } else if (isAuthenticated && !needsOnboarding && (inAuthGroup || inOnboardingGroup || !firstSegment)) {
      // Authenticated and onboarded → main app
      router.replace('/(app)' as Href);
    } else if (!isAuthenticated && (inAppGroup || inOnboardingGroup || !firstSegment)) {
      // Not authenticated → login
      router.replace('/(auth)/login' as Href);
    }
  }, [isAuthenticated, needsOnboarding, isLoading, segments, showAnimatedSplash]);

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

  return (
    <ToastProvider isDark={isDark}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="splash-preview" />
      </Stack>
      {/* Prominent background-location disclosure — overlays the app when a
          background service needs consent (Google Play requirement). */}
      <LocationConsentModal />
    </ToastProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_800ExtraBold,
  });
  const [langLoaded, setLangLoaded] = useState(false);

  useEffect(() => {
    i18nReady.then(() => setLangLoaded(true));
  }, []);

  if (!fontsLoaded || !langLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <SafeAreaProvider>
          <ThemeProvider>
            <AuthProvider>
              <RootLayoutNav />
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
