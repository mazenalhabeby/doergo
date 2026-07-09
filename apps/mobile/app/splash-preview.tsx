import { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Redirect, Href } from 'expo-router';
import { AnimatedSplash } from '../src/components';

/**
 * Dev-only route for recording the launch animation.
 *
 * Plays {@link AnimatedSplash} on a continuous loop with no navigation, so you
 * can capture a clean, repeatable take (e.g. for the intro video) without
 * quitting/relaunching the app each time. Open it at `/splash-preview`.
 *
 * Not shipped: in a production build it immediately redirects to the app root.
 */
export default function SplashPreview() {
  // Remounting AnimatedSplash (via a changing key) restarts the animation.
  const [runId, setRunId] = useState(0);

  const handleComplete = useCallback(() => {
    // Small beat between loops so the exit zoom reads cleanly, then replay.
    setTimeout(() => setRunId((n) => n + 1), 400);
  }, []);

  if (!__DEV__) {
    return <Redirect href={'/(app)' as Href} />;
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <AnimatedSplash key={runId} onAnimationComplete={handleComplete} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
});
