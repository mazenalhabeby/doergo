import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ICON_SIZE,
  type AnimatedSplashProps,
  RippleRing,
  OrbitDot,
  BurstParticle,
  SplashArrowIcon,
  styles,
} from './orbit-dot';

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
