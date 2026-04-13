import { useRef, useEffect } from 'react';
import { Animated } from 'react-native';

interface AuthAnimationsConfig {
  /** Initial slide offset (default: 30) */
  slideOffset?: number;
  /** Fade/slide duration in ms (default: 800) */
  duration?: number;
  /** Orb1 float offset (default: -20) */
  orb1Offset?: number;
  /** Orb2 float offset (default: 15) */
  orb2Offset?: number;
  /** Whether to auto-start animations (default: true) */
  autoStart?: boolean;
}

/**
 * Shared animation setup for auth/onboarding screens.
 * Provides fade-in, slide-up, and floating orb animations.
 */
export function useAuthAnimations(config?: AuthAnimationsConfig) {
  const {
    slideOffset = 30,
    duration = 800,
    orb1Offset = -20,
    orb2Offset = 15,
    autoStart = true,
  } = config ?? {};

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(slideOffset)).current;
  const orb1Anim = useRef(new Animated.Value(0)).current;
  const orb2Anim = useRef(new Animated.Value(0)).current;

  const startAnimations = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(orb1Anim, { toValue: 1, duration: 3000, useNativeDriver: true }),
        Animated.timing(orb1Anim, { toValue: 0, duration: 3000, useNativeDriver: true }),
      ]),
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(orb2Anim, { toValue: 1, duration: 4000, useNativeDriver: true }),
        Animated.timing(orb2Anim, { toValue: 0, duration: 4000, useNativeDriver: true }),
      ]),
    ).start();
  };

  useEffect(() => {
    if (autoStart) startAnimations();
  }, []);

  const orb1TranslateY = orb1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, orb1Offset],
  });

  const orb2TranslateY = orb2Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, orb2Offset],
  });

  return {
    fadeAnim,
    slideAnim,
    orb1TranslateY,
    orb2TranslateY,
    startAnimations,
  };
}
