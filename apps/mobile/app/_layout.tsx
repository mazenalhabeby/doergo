import 'react-native-gesture-handler';
import { useEffect, useState, useCallback } from 'react';
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
import { AnimatedSplash } from '../src/components';

// Keep the native splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { isAuthenticated, isLoading, needsOnboarding } = useAuth();
  const { colors, isDark } = useTheme();
  const segments = useSegments();
  const router = useRouter();
  const [showAnimatedSplash, setShowAnimatedSplash] = useState(true);
  const [appIsReady, setAppIsReady] = useState(false);
  const [splashHidden, setSplashHidden] = useState(false);

  // Hide native splash when auth state is loaded (only once)
  useEffect(() => {
    async function prepare() {
      if (!isLoading && !splashHidden) {
        try {
          // Hide the native splash screen
          await SplashScreen.hideAsync();
        } catch (e) {
          // Ignore error if splash screen was already hidden
          console.log('SplashScreen already hidden');
        }
        setSplashHidden(true);
        setAppIsReady(true);
      }
    }
    prepare();
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
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_800ExtraBold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <RootLayoutNav />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
});
