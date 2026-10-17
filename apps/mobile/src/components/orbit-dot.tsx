import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Dimensions, Image } from 'react-native';

export const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export const ICON_SIZE = 130;

export interface AnimatedSplashProps {
  onAnimationComplete: () => void;
}

/* ── Ripple ring that expands outward from center ── */
export function RippleRing({ delay, duration, maxScale, color }: {
  delay: number; duration: number; maxScale: number; color: string;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, {
          toValue: 1,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.ripple,
        {
          borderColor: color,
          opacity: anim.interpolate({
            inputRange: [0, 0.3, 1],
            outputRange: [0.6, 0.3, 0],
          }),
          transform: [{
            scale: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.6, maxScale],
            }),
          }],
        },
      ]}
    />
  );
}

/* ── Orbiting dot ── */
export function OrbitDot({ delay, radius, orbitDuration, size, color }: {
  delay: number; radius: number; orbitDuration: number; size: number; color: string;
}) {
  const angle = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(fadeIn, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.timing(angle, {
        toValue: 1,
        duration: orbitDuration,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();
  }, []);

  // We use translateX/Y to approximate circular motion via two phase-shifted sines
  const translateX = angle.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [radius, 0, -radius, 0, radius],
  });
  const translateY = angle.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, -radius, 0, radius, 0],
  });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity: fadeIn,
        transform: [{ translateX }, { translateY }],
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: size,
      }}
    />
  );
}

/* ── Burst particle for exit transition ── */
export function BurstParticle({ delay, angle, distance, size, color, duration }: {
  delay: number; angle: number; distance: number; size: number; color: string; duration: number;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(anim, {
        toValue: 1,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: size * 2,
        opacity: anim.interpolate({
          inputRange: [0, 0.15, 0.7, 1],
          outputRange: [0, 1, 0.8, 0],
        }),
        transform: [
          { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * distance] }) },
          { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * distance] }) },
          { scale: anim.interpolate({ inputRange: [0, 0.2, 0.6, 1], outputRange: [0, 1.4, 1, 0] }) },
        ],
      }}
    />
  );
}

/* ── Brand mark for splash (new faceted logo) ── */
export function SplashArrowIcon({ size }: { size: number }) {
  return (
    <Image
      source={require('../../assets/logo_HBCFIELD.png')}
      style={{ width: size, height: size, resizeMode: 'contain' }}
    />
  );
}

export const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },

  /* Background orbs */
  bgOrb: { position: 'absolute', borderRadius: 999 },
  orb1: { top: SCREEN_HEIGHT * 0.08, right: -80, width: 260, height: 260 },
  orb2: { bottom: SCREEN_HEIGHT * 0.12, left: -100, width: 300, height: 300 },
  orbFill: { width: '100%', height: '100%', borderRadius: 999 },

  /* Icon area - everything centered on the arrow */
  iconArea: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },

  /* Glow behind arrow - same size center as iconArea */
  glow: {
    position: 'absolute',
    width: ICON_SIZE * 1.8,
    height: ICON_SIZE * 1.8,
    borderRadius: ICON_SIZE * 0.9,
  },
  glowFill: {
    width: '100%',
    height: '100%',
    borderRadius: ICON_SIZE * 0.9,
  },

  /* Ripple rings centered on icon */
  ripple: {
    position: 'absolute',
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    borderWidth: 1.5,
  },

  /* Burst particles center */
  burstCenter: {
    position: 'absolute',
    width: 0,
    height: 0,
    zIndex: 10,
  },

  /* Wordmark */
  wordmarkWrap: {
    marginTop: 20,
    overflow: 'hidden',
    paddingHorizontal: 4,
  },
  wordmark: {
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 38,
    fontWeight: '800',
    color: '#fafafa',
    letterSpacing: 1,
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 60,
  },

  /* Tagline at bottom */
  tagline: {
    position: 'absolute',
    bottom: SCREEN_HEIGHT * 0.15,
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(161,161,170,0.7)',
    letterSpacing: 4,
  },
});
