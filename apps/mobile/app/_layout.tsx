import { useEffect, useState, useCallback } from 'react';
import { Stack, useRouter, useSegments, Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as NavigationBar from 'expo-navigation-bar';
import { AuthProvider, useAuth } from '../src/contexts/auth-context';
import { AnimatedSplash } from '../src/components';

// Keep the native splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { isAuthenticated, isLoading } = useAuth();
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

  // Configure Android navigation bar based on current screen
  useEffect(() => {
    if (Platform.OS === 'android') {
      if (!appIsReady || showAnimatedSplash) {
        NavigationBar.setBackgroundColorAsync('#0a0f1a');
        NavigationBar.setButtonStyleAsync('light');
      } else {
        NavigationBar.setBackgroundColorAsync('#f1f5f9');
        NavigationBar.setButtonStyleAsync('dark');
      }
    }
  }, [appIsReady, showAnimatedSplash]);


  // Handle navigation after auth state changes
  useEffect(() => {
    if (isLoading || showAnimatedSplash) return;

    const firstSegment = segments[0] as string | undefined;
    const inAuthGroup = firstSegment === '(auth)';
    const inAppGroup = firstSegment === '(app)';

    if (isAuthenticated && (inAuthGroup || !firstSegment)) {
      router.replace('/(app)' as Href);
    } else if (!isAuthenticated && (inAppGroup || !firstSegment)) {
      router.replace('/(auth)/login' as Href);
    }
  }, [isAuthenticated, isLoading, segments, showAnimatedSplash]);

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
        <Stack.Screen name="(app)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1a',
  },
});
