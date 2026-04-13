import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, G, Polygon } from 'react-native-svg';

import { COLORS } from '../lib/constants';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const ICON_SIZE = 130;

interface AnimatedSplashProps {
  onAnimationComplete: () => void;
}

/* ── Ripple ring that expands outward from center ── */
function RippleRing({ delay, duration, maxScale, color }: {
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
function OrbitDot({ delay, radius, orbitDuration, size, color }: {
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
function BurstParticle({ delay, angle, distance, size, color, duration }: {
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

/* ── Large arrow SVG for splash ── */
function SplashArrowIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <SvgGradient id="splash-at" x1="0" y1="0" x2="0.5" y2="1">
          <Stop offset="0%" stopColor="#059669" />
          <Stop offset="100%" stopColor="#10b981" />
        </SvgGradient>
        <SvgGradient id="splash-ab" x1="0" y1="0" x2="0.5" y2="1">
          <Stop offset="0%" stopColor="#3b82f6" />
          <Stop offset="100%" stopColor="#60a5fa" />
        </SvgGradient>
        <SvgGradient id="splash-ac" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%" stopColor="#047857" />
          <Stop offset="100%" stopColor="#1e40af" />
        </SvgGradient>
      </Defs>
      <G transform="translate(24,24)">
        <Polygon points="18,-2 -10,-20 -2,-2" fill="url(#splash-at)" />
        <Polygon points="18,2 -10,20 -2,2" fill="url(#splash-ab)" />
        <Polygon points="-2,-2 18,0 -2,2 -16,0" fill="url(#splash-ac)" opacity="0.8" />
        <Polygon points="-10,-20 -16,0 -2,-2" fill="#047857" opacity="0.45" />
        <Polygon points="-10,20 -16,0 -2,2" fill="#1e3a8a" opacity="0.25" />
      </G>
    </Svg>
  );
}

/* ── Main splash component ── */
export function AnimatedSplash({ onAnimationComplete }: AnimatedSplashProps) {
  const iconScale = useRef(new Animated.Value(0)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const arrowRotation = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const glowScale = useRef(new Animated.Value(0.5)).current;
  const wordmarkOpacity = useRef(new Animated.Value(0)).current;
  const wordmarkTranslateX = useRef(new Animated.Value(-30)).current;
  const shimmerPos = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineTranslateY = useRef(new Animated.Value(15)).current;
  const finalZoom = useRef(new Animated.Value(1)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const bgShift = useRef(new Animated.Value(0)).current;

  const [showRipples, setShowRipples] = useState(false);
  const [showOrbits, setShowOrbits] = useState(false);
  const [showBurst, setShowBurst] = useState(false);

  useEffect(() => {
    // Subtle background breathing
    Animated.loop(
      Animated.sequence([
        Animated.timing(bgShift, { toValue: 1, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(bgShift, { toValue: 0, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ]),
    ).start();

    // Main choreography
    Animated.sequence([
      Animated.delay(200),

      // 1) Glow fades in first (sets the stage)
      Animated.parallel([
        Animated.timing(glowOpacity, { toValue: 0.5, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(glowScale, { toValue: 1, friction: 10, tension: 30, useNativeDriver: true }),
      ]),

      // 2) Arrow flies in with rotation + scale bounce
      Animated.parallel([
        Animated.spring(iconScale, { toValue: 1, friction: 5, tension: 50, useNativeDriver: true }),
        Animated.timing(iconOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(arrowRotation, { toValue: 1, duration: 900, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }),
      ]),

      // 3) Start ripples + orbits
      Animated.delay(100),

      // 4) Wordmark slides in + shimmer
      Animated.parallel([
        Animated.timing(wordmarkOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(wordmarkTranslateX, { toValue: 0, friction: 7, tension: 50, useNativeDriver: true }),
      ]),

      // 5) Shimmer sweep across wordmark
      Animated.timing(shimmerPos, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),

      Animated.delay(100),

      // 6) Tagline
      Animated.parallel([
        Animated.timing(taglineOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(taglineTranslateY, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }),
      ]),

      Animated.delay(600),
    ]).start(() => {
      // After sequence, wait a moment then exit
      startExitTransition();
    });

    // Show ripples + orbits slightly after the icon appears
    const rippleTimer = setTimeout(() => setShowRipples(true), 900);
    const orbitTimer = setTimeout(() => setShowOrbits(true), 1100);

    return () => { clearTimeout(rippleTimer); clearTimeout(orbitTimer); };
  }, []);

  const startExitTransition = () => {
    setShowBurst(true);

    // Flash the glow brighter
    Animated.sequence([
      Animated.timing(glowOpacity, { toValue: 1, duration: 100, useNativeDriver: true }),
      Animated.timing(glowOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();

    // Zoom out after burst
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(finalZoom, { toValue: 20, duration: 700, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(containerOpacity, { toValue: 0, duration: 350, delay: 400, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start(() => onAnimationComplete());
    }, 350);
  };

  const arrowRotate = arrowRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['-120deg', '0deg'],
  });

  // Generate burst particles
  const burstParticles = [];
  const burstCount = 16;
  for (let i = 0; i < burstCount; i++) {
    const angle = (i / burstCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
    const dist = 50 + Math.random() * 60;
    const sz = 3 + Math.random() * 5;
    const colors = ['#059669', '#10b981', '#3b82f6', '#60a5fa'];
    burstParticles.push(
      <BurstParticle
        key={i}
        delay={Math.random() * 60}
        angle={angle}
        distance={dist}
        size={sz}
        color={colors[i % colors.length]!}
        duration={450}
      />,
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      {/* Background gradient */}
      <LinearGradient
        colors={['#09090b', '#0c1524', '#09090b']}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Breathing background orbs */}
      <Animated.View style={[styles.bgOrb, styles.orb1, {
        opacity: bgShift.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.45] }),
      }]}>
        <LinearGradient colors={['rgba(5,150,105,0.35)', 'transparent']} style={styles.orbFill} />
      </Animated.View>
      <Animated.View style={[styles.bgOrb, styles.orb2, {
        opacity: bgShift.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.2] }),
      }]}>
        <LinearGradient colors={['rgba(59,130,246,0.25)', 'transparent']} style={styles.orbFill} />
      </Animated.View>

      {/* ─── Icon area (centered on screen) ─── */}
      <Animated.View style={[styles.iconArea, {
        transform: [{ scale: Animated.multiply(iconScale, finalZoom) }],
      }]}>
        {/* Glow - perfectly centered behind arrow */}
        <Animated.View style={[styles.glow, {
          opacity: glowOpacity,
          transform: [{ scale: glowScale }],
        }]}>
          <LinearGradient
            colors={['rgba(5,150,105,0.6)', 'rgba(59,130,246,0.25)', 'transparent']}
            style={styles.glowFill}
            start={{ x: 0.5, y: 0.5 }}
            end={{ x: 1, y: 1 }}
          />
        </Animated.View>

        {/* Ripple rings */}
        {showRipples && (
          <>
            <RippleRing delay={0} duration={2400} maxScale={2.2} color="rgba(5,150,105,0.35)" />
            <RippleRing delay={800} duration={2400} maxScale={2.6} color="rgba(16,185,129,0.2)" />
            <RippleRing delay={1600} duration={2400} maxScale={3.0} color="rgba(59,130,246,0.15)" />
          </>
        )}

        {/* Orbiting dots */}
        {showOrbits && (
          <>
            <OrbitDot delay={0} radius={80} orbitDuration={3000} size={4} color="#10b981" />
            <OrbitDot delay={500} radius={80} orbitDuration={3000} size={3} color="#3b82f6" />
            <OrbitDot delay={1000} radius={80} orbitDuration={3000} size={3.5} color="#059669" />
          </>
        )}

        {/* Burst particles on exit */}
        {showBurst && (
          <View style={styles.burstCenter}>{burstParticles}</View>
        )}

        {/* Arrow icon */}
        <Animated.View style={{ opacity: iconOpacity, transform: [{ rotate: arrowRotate }] }}>
          <SplashArrowIcon size={ICON_SIZE} />
        </Animated.View>
      </Animated.View>

      {/* ─── Wordmark (below icon area) ─── */}
      <Animated.View style={[styles.wordmarkWrap, {
        opacity: wordmarkOpacity,
        transform: [{ translateX: wordmarkTranslateX }],
      }]}>
        <Text style={styles.wordmark}>HBC FIELD</Text>
        {/* Shimmer overlay */}
        <Animated.View style={[styles.shimmer, {
          opacity: shimmerPos.interpolate({ inputRange: [0, 0.4, 0.6, 1], outputRange: [0, 0.7, 0.7, 0] }),
          transform: [{
            translateX: shimmerPos.interpolate({ inputRange: [0, 1], outputRange: [-160, 160] }),
          }],
        }]}>
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.35)', 'transparent']}
            style={{ width: 60, height: '100%' }}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
          />
        </Animated.View>
      </Animated.View>

      {/* ─── Tagline ─── */}
      <Animated.Text style={[styles.tagline, {
        opacity: Animated.multiply(taglineOpacity, containerOpacity),
        transform: [{ translateY: taglineTranslateY }],
      }]}>
        DISPATCH  ·  TRACK  ·  DELIVER
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
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
