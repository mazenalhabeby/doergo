import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PRIMARY_COLOR = '#2563EB';

interface AnimatedSplashProps {
  onAnimationComplete: () => void;
}

// Particle component for the burst effect
function Particle({
  delay,
  angle,
  distance,
  size,
  color,
  duration,
}: {
  delay: number;
  angle: number;
  distance: number;
  size: number;
  color: string;
  duration: number;
}) {
  const animation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(animation, {
        toValue: 1,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const translateX = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.cos(angle) * distance],
  });

  const translateY = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.sin(angle) * distance],
  });

  const scale = animation.interpolate({
    inputRange: [0, 0.2, 0.8, 1],
    outputRange: [0, 1, 1, 0],
  });

  const opacity = animation.interpolate({
    inputRange: [0, 0.2, 0.8, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          transform: [{ translateX }, { translateY }, { scale }],
          opacity,
        },
      ]}
    />
  );
}

export function AnimatedSplash({ onAnimationComplete }: AnimatedSplashProps) {
  // Logo dimensions
  const LOGO_WIDTH = 280;
  const LOGO_HEIGHT = (LOGO_WIDTH / 1136.91) * 339.57;

  // Final "o" button position (the start button)
  // Button overlay: right: -5, top: 10, width: 50, height: 55
  const BUTTON_WIDTH = 50;
  const BUTTON_HEIGHT = 55;
  const BUTTON_CENTER_X = LOGO_WIDTH + 5 - BUTTON_WIDTH / 2;
  const BUTTON_CENTER_Y = 10 + BUTTON_HEIGHT / 2;

  // Animation values
  const logoScale = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const gearRotation = useRef(new Animated.Value(0)).current;
  const buttonGlow = useRef(new Animated.Value(0)).current;
  const buttonPulse = useRef(new Animated.Value(1)).current;
  const buttonRingScale = useRef(new Animated.Value(1)).current;
  const buttonRingOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(20)).current;
  const finalZoom = useRef(new Animated.Value(1)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const backgroundShift = useRef(new Animated.Value(0)).current;

  const [showParticles, setShowParticles] = useState(false);
  const pulseAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const ringAnimation = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    // Background animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(backgroundShift, {
          toValue: 1,
          duration: 3000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(backgroundShift, {
          toValue: 0,
          duration: 3000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ])
    ).start();

    // Main animation sequence
    Animated.sequence([
      Animated.delay(300),

      // Logo entrance with gear rotation
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 6,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        // Gear spins into place
        Animated.timing(gearRotation, {
          toValue: 1,
          duration: 1000,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),

      Animated.delay(300),

      // Tagline reveal
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.spring(textTranslateY, {
          toValue: 0,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]),

      Animated.delay(400),
    ]).start(() => {
      startButtonPulse();

      setTimeout(() => {
        triggerButtonPress();
      }, 1200);
    });
  }, []);

  const startButtonPulse = () => {
    // Pulsing glow effect on the final "o" button
    Animated.loop(
      Animated.sequence([
        Animated.timing(buttonGlow, {
          toValue: 1,
          duration: 500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(buttonGlow, {
          toValue: 0.3,
          duration: 500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Subtle scale pulse
    pulseAnimation.current = Animated.loop(
      Animated.sequence([
        Animated.timing(buttonPulse, {
          toValue: 1.1,
          duration: 500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(buttonPulse, {
          toValue: 1,
          duration: 500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    pulseAnimation.current.start();

    // Expanding ring effect
    ringAnimation.current = Animated.loop(
      Animated.parallel([
        Animated.timing(buttonRingScale, {
          toValue: 2,
          duration: 1200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(buttonRingOpacity, {
            toValue: 0.6,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(buttonRingOpacity, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    ringAnimation.current.start();
  };

  const triggerButtonPress = () => {
    setShowParticles(true);

    // Stop pulse animations
    if (pulseAnimation.current) pulseAnimation.current.stop();
    if (ringAnimation.current) ringAnimation.current.stop();

    // Button press effect
    Animated.sequence([
      // Press down
      Animated.timing(buttonPulse, {
        toValue: 0.85,
        duration: 80,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // Bounce back
      Animated.spring(buttonPulse, {
        toValue: 1.2,
        friction: 4,
        tension: 400,
        useNativeDriver: true,
      }),
    ]).start();

    // Flash the glow bright
    Animated.sequence([
      Animated.timing(buttonGlow, {
        toValue: 2,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(buttonGlow, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Zoom into the app
    setTimeout(() => {
      Animated.parallel([
        // Logo zooms in massively
        Animated.timing(finalZoom, {
          toValue: 25,
          duration: 800,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        // Fade out near the end
        Animated.timing(containerOpacity, {
          toValue: 0,
          duration: 400,
          delay: 450,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        onAnimationComplete();
      });
    }, 400);
  };

  const gearRotate = gearRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Generate particles around the button
  const particles = [];
  const particleCount = 12;
  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2;
    const distance = 60 + Math.random() * 40;
    const size = 3 + Math.random() * 4;
    const delay = Math.random() * 80;
    const colors = [PRIMARY_COLOR, '#60A5FA', '#93C5FD'];
    particles.push(
      <Particle
        key={i}
        delay={delay}
        angle={angle}
        distance={distance}
        size={size}
        color={colors[i % colors.length]}
        duration={400}
      />
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      <LinearGradient
        colors={['#0a0f1a', '#0f172a', '#1a1f35']}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Animated background orbs */}
      <Animated.View
        style={[
          styles.backgroundOrb,
          styles.orb1,
          {
            opacity: backgroundShift.interpolate({
              inputRange: [0, 1],
              outputRange: [0.3, 0.5],
            }),
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(37, 99, 235, 0.4)', 'transparent']}
          style={styles.orbGradient}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.backgroundOrb,
          styles.orb2,
          {
            opacity: backgroundShift.interpolate({
              inputRange: [0, 1],
              outputRange: [0.5, 0.3],
            }),
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(139, 92, 246, 0.3)', 'transparent']}
          style={styles.orbGradient}
        />
      </Animated.View>

      {/* Main content container */}
      <Animated.View
        style={[
          styles.contentContainer,
          {
            opacity: logoOpacity,
            transform: [
              { scale: Animated.multiply(logoScale, finalZoom) },
            ],
          },
        ]}
      >
        {/* Button glow effect - behind the final "o" */}
        <Animated.View
          style={[
            styles.buttonGlow,
            {
              left: BUTTON_CENTER_X - 50,
              top: BUTTON_CENTER_Y - 50,
              opacity: buttonGlow,
              transform: [{ scale: buttonPulse }],
            },
          ]}
        >
          <LinearGradient
            colors={[PRIMARY_COLOR, 'rgba(37, 99, 235, 0.4)', 'transparent']}
            style={styles.glowGradient}
            start={{ x: 0.5, y: 0.5 }}
            end={{ x: 1, y: 1 }}
          />
        </Animated.View>

        {/* Expanding ring effect */}
        <Animated.View
          style={[
            styles.buttonRing,
            {
              left: BUTTON_CENTER_X - 35,
              top: BUTTON_CENTER_Y - 35,
              opacity: buttonRingOpacity,
              transform: [{ scale: buttonRingScale }],
            },
          ]}
        />

        {/* Particles burst from button */}
        {showParticles && (
          <View
            style={[
              styles.particlesContainer,
              {
                left: BUTTON_CENTER_X,
                top: BUTTON_CENTER_Y,
              }
            ]}
          >
            {particles}
          </View>
        )}

        {/* Main Logo - without gear and final o (they are animated separately) */}
        <View style={[styles.logoWrapper, { width: LOGO_WIDTH, height: LOGO_HEIGHT }]}>
          <Svg
            width={LOGO_WIDTH}
            height={LOGO_HEIGHT}
            viewBox="0 0 1136.91 339.57"
            fill="none"
          >
            {/* Letter D */}
            <Path
              fill="#ffffff"
              d="M181.1,0h-57.73s-.52,81.47-.52,81.47c-44.89-15.56-92.64,3.02-113.36,44.38-11.25,22.47-12.5,49.63-3.71,73.55,11.72,31.9,41.72,55.01,76.4,57.9,52.03,4.32,94.45-32.62,99.08-82.83l-.16-174.47ZM99.4,202.44c-2.45.56-4.9.87-7.33.95-.19,0-.38,0-.58,0-.4,0-.79.02-1.19.01-16.18-.19-30.94-10.64-35.2-27.87-4.53-18.32,5.71-38.58,26.59-44.11,3.02-.8,5.99-1.2,8.88-1.26,17.13-.38,31.46,11.56,35.75,28.54,4.72,18.63-7.72,39.37-26.93,43.73Z"
            />
            {/* Letter e */}
            <Path
              fill="#ffffff"
              d="M582.79,155.52c-2.33-34.87-24.45-64.86-57.71-76.02-14.64-4.91-29.31-6.1-44.78-4.74-43.28,3.8-76.86,36.8-80.95,80.18-4.4,46.52,22.21,85.04,67.29,96.67,34.45,8.89,74.02-.37,98.72-26.46-.57-1.27-1.84-3.51-2.6-4.19l-28.34-25.19c-20.18,18.28-55.26,21.93-74.75.35-2.82-3.13-4.78-7.39-6.63-11.76l26.8-.71c8.93-.23,17.68-.45,26.66.02,10.84.57,21.51.55,32.37.01,19.09-.94,24.66.47,42.55.26,1.12-10.4,2.02-18.72,1.37-28.41ZM528.26,147.7l-76.02-.05c3.85-18.71,20.59-29.55,38.73-29.53,10.89.01,20.69,2,28.75,10.13,5.39,5.44,10.22,12.33,8.54,19.46Z"
            />
            {/* Letter r */}
            <Path
              fill="#ffffff"
              d="M654.51,254.84l-53.46.05V78.57s34.64.15,34.64.15l16.02.06,1.39,16.49c15-13.93,31.7-22.21,51.81-20.9,13.88.32,27.38,3.3,39.17,11.47l-25.11,44.96c-15.16-8.17-32.85-8.25-46.78,1.6-10.65,7.52-17.24,20.5-17.3,33.86l-.39,88.57Z"
            />
            {/* Letter g */}
            <Path
              fill="#ffffff"
              d="M911.91,195.4c26.66-38.41,20.22-88.93-12.86-119.39-32.9-30.29-82.71-32.47-118.2-4.5-34.8,27.42-45.12,76.63-23.15,115.73,21.55,38.36,67.81,56.94,110.79,41.37,10.91,17.9,5.18,40.76-12.12,51.21-16.16,9.77-37.47,5.78-49.64-10.16l-43.95,30.64c14.49,22.28,39.22,36.67,67.4,38.96,36.01,2.94,68.31-15.41,85.68-44.47,18.9-31.63,16.18-69.43-3.93-99.4ZM862.7,169.17c-12.92,12.87-34.06,14.39-48.67,1.81-8.37-7.21-13.44-17.07-13.66-27.3-.23-10.73,4.63-20.55,12.78-28.1,15.69-14.54,39.61-12.2,53.35,5.33,12.16,15.5,9.2,35.32-3.8,48.27Z"
            />
          </Svg>

          {/* Animated Gear - in its own place, rotates on entrance */}
          <Animated.View
            style={[
              styles.gearOverlay,
              {
                transform: [{ rotate: gearRotate }],
              },
            ]}
          >
            <Svg
              width={40}
              height={40}
              viewBox="208 82 160 160"
              fill="none"
            >
              <Path
                fill={PRIMARY_COLOR}
                d="M380.43,178.51l.09-27.03-20.97-6.16-5.95-14.96,9.94-17.37c.44-.77-.22-3.57-1.02-4.36l-16.91-16.92c-6.38,1.69-11.36,4.67-16.88,8.21-2.44,1.56-4.5,1.41-7.01.29l-11.63-5.16c-1.58-7.62-2.98-13.96-5.61-20.8l-28.23.21-5.53,20.6-15.2,6.41-16.99-9.33c-.95-.52-4.06-.57-4.94.35l-14.4,15.13c-1.71,1.8-2.88,4.21-1.62,6.37l9.59,16.45-6.76,14.86c-7.54,1.88-14.09,3.68-20.89,7.17l.24,25.13,21.85,7.04,5.35,13.97-9.64,16.07c-.66,1.1-.47,4.03.62,5.12l16.14,16.12c.93.93,4.32.25,5.4-.39l16.18-9.73,14.78,6.34,5.23,19.31c.49,1.82,2.28,3.47,4.47,3.46l21.02-.13c1.16,0,4.05-1.22,4.37-2.49l5.03-19.51,9.39-4.22c1.71-.77,4.66-2.61,6.25-1.66,6.64,3.95,11.95,6.89,19.36,10.33l16.2-16.12c1.02-1.01,2.45-4.24,1.67-5.54l-9.81-16.43,5.3-14.72,21.54-5.9ZM328.64,183.46c-7.31,14.92-23.11,24.81-40.58,23.66-24.37-1.61-41.99-21.58-40.8-45.36,1.17-23.59,21.77-42.04,45.79-40.58,11.72.71,21.11,5.44,29.1,14.43,11.83,13.3,14.32,31.84,6.48,47.85Z"
              />
            </Svg>
          </Animated.View>

          {/* Animated final "o" button - in its own place, pulses as start button */}
          <Animated.View
            style={[
              styles.buttonOverlay,
              {
                transform: [{ scale: buttonPulse }],
              },
            ]}
          >
            <Svg
              width={50}
              height={55}
              viewBox="940 40 200 220"
              fill="none"
            >
              {/* Final o circle */}
              <Path
                fill="#ffffff"
                d="M1073.35,115.51l.08-42.88c15.3,4.39,27.26,13.13,37.66,24.01,39.92,41.81,32.58,109.46-15.33,141.83-27.27,18.43-61.82,21.37-92.28,8.75-25.72-10.66-44.54-32.21-52.47-55.73-10.07-29.89-5-59.79,11.7-84.02,11.16-16.18,25.93-28.26,44.92-34.73l.26,43.47c-21.82,16.04-28.79,44.2-16.98,68.69,13.83,28.66,49.97,39.28,76.93,24.58,16.92-9.23,27.77-26.02,29.21-44.33,1.55-19.81-7.23-37.65-23.71-49.64Z"
              />
              {/* Blue accent bar - looks like play/start indicator */}
              <Path
                fill={PRIMARY_COLOR}
                d="M1058.8,142.22l-17.77.36c-6.05.12-11.92.85-17.79-.15l-.08-91.37,35.55.03.09,91.13Z"
              />
            </Svg>
          </Animated.View>
        </View>
      </Animated.View>

      {/* Tagline */}
      <Animated.Text
        style={[
          styles.tagline,
          {
            opacity: Animated.multiply(textOpacity, containerOpacity),
            transform: [{ translateY: textTranslateY }],
          },
        ]}
      >
        WORK SMARTER
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
  backgroundOrb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orb1: {
    top: SCREEN_HEIGHT * 0.1,
    right: -80,
    width: 250,
    height: 250,
  },
  orb2: {
    bottom: SCREEN_HEIGHT * 0.15,
    left: -100,
    width: 300,
    height: 300,
  },
  orbGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  contentContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrapper: {
    position: 'relative',
  },
  gearOverlay: {
    position: 'absolute',
    left: 52,
    top: 19,
  },
  buttonOverlay: {
    position: 'absolute',
    right: -5,
    top: 10,
  },
  buttonGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  glowGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
  },
  buttonRing: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2,
    borderColor: PRIMARY_COLOR,
  },
  particlesContainer: {
    position: 'absolute',
    width: 0,
    height: 0,
    zIndex: 10,
  },
  particle: {
    position: 'absolute',
  },
  tagline: {
    position: 'absolute',
    bottom: SCREEN_HEIGHT * 0.22,
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
});
