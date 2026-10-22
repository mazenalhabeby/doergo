import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/theme-context';
import { AText } from '../../components/amazen';
import { personInitials } from '@hbcfield/shared/client';

/** What the front of the pass says — or `blank` for the side the code is typed onto. */
type PassFace = 'blank' | 'staff' | 'visitor' | 'reception' | 'refused';

const STRIP: Record<Exclude<PassFace, 'blank'>, [string, string]> = {
  staff: ['#0b8168', '#7fe6c8'],
  visitor: ['#b26a14', '#f2b263'],
  reception: ['#b26a14', '#f2b263'],
  refused: ['#7a2a22', '#e2685b'],
};
const INK = '#0b1f1a';
const CARD = ['#f4f8f6', '#e3ebe8'] as const;

/** Up to two letters for a company's mark. */
const monogram = (name?: string | null) => personInitials(name, '·');

/**
 * THE PASS — a badge on a lanyard. The code is typed onto its back; once the
 * code is recognised it turns over and shows who it was printed for.
 *
 * Built on Animated (rotateY + backfaceVisibility), not Reanimated layout
 * props. The sway stops when the phone asks for reduced motion.
 */
export function PassBadge({
  face, strip, company, name, role, roleTone = 'accent', footLeft, footRight, stamp, children,
}: {
  face: PassFace;
  /** The strip's word — STAFF, VISITOR, AT RECEPTION, NOT ISSUED. */
  strip?: string;
  company?: string;
  name?: string;
  role?: React.ReactNode;
  roleTone?: 'accent' | 'warn' | 'critical';
  footLeft?: string;
  footRight?: string;
  stamp?: { text: string; tone: 'warn' | 'critical' };
  /** The blank side's content — where the code is typed. */
  children?: React.ReactNode;
}) {
  const { amazen } = useTheme();
  const flip = useRef(new Animated.Value(face === 'blank' ? 0 : 1)).current;
  const sway = useRef(new Animated.Value(0)).current;
  const [still, setStill] = useState(false);

  useEffect(() => { void AccessibilityInfo.isReduceMotionEnabled().then(setStill).catch(() => undefined); }, []);
  useEffect(() => {
    Animated.timing(flip, {
      toValue: face === 'blank' ? 0 : 1,
      duration: 850,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [face, flip]);
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(sway, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(sway, { toValue: -1, duration: 3000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [still, sway]);

  const swing = sway.interpolate({ inputRange: [-1, 1], outputRange: ['-1.4deg', '1.4deg'] });
  const backRot = flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const frontRot = flip.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  const roleColor = roleTone === 'warn' ? '#a45d0f' : roleTone === 'critical' ? '#b3392c' : '#0b8168';
  const faceStyle = {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 26,
    overflow: 'hidden' as const,
    backfaceVisibility: 'hidden' as const,
  };

  return (
    <View style={{ alignItems: 'center' }} pointerEvents="box-none">
      {/* The lanyard and its clip. */}
      <View style={{ width: 70, height: 84, alignItems: 'center' }} pointerEvents="none">
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 14,
            width: 13,
            height: 80,
            borderRadius: 3,
            backgroundColor: '#10b993',
            transform: [{ rotate: '9deg' }],
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: 0,
            right: 14,
            width: 13,
            height: 80,
            borderRadius: 3,
            backgroundColor: '#10b993',
            transform: [{ rotate: '-9deg' }],
          }}
        />
        <LinearGradient
          colors={['#d9e2df', '#8d9a96']}
          style={{ position: 'absolute', bottom: -8, width: 34, height: 22, borderRadius: 6, zIndex: 2 }}
        />
      </View>
      <Animated.View style={{ width: 300, height: 364, transform: [{ translateY: -60 }, { rotate: swing }, { translateY: 60 }] }}>
        {/* The side the code goes onto. */}
        <Animated.View
          style={[faceStyle, { transform: [{ perspective: 1400 }, { rotateY: backRot }] }]}
          pointerEvents={face === 'blank' ? 'auto' : 'none'}>
          <LinearGradient colors={CARD} style={{ flex: 1, alignItems: 'center', paddingTop: 44, paddingHorizontal: 20 }}>
            <Slot />
            {children}
            <AText
              style={{
                position: 'absolute',
                bottom: 14,
                fontFamily: amazen.font.mono,
                fontSize: 10,
                letterSpacing: 6,
                color: `${INK}40`,
              }}
            >
              HBCFIELD
            </AText>
          </LinearGradient>
        </Animated.View>
        {/* The side it turns to: who it was printed for. */}
        <Animated.View style={[faceStyle, { transform: [{ perspective: 1400 }, { rotateY: frontRot }] }]} pointerEvents="none">
          <LinearGradient colors={CARD} style={{ flex: 1 }}>
            {face !== 'blank' ? (
              <>
                <LinearGradient
                  colors={STRIP[face]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ height: 76, paddingTop: 30, paddingHorizontal: 16 }}>
                  <AText style={{ color: '#fff', fontFamily: amazen.font.mono, fontSize: 9.5, letterSpacing: 2 }}>{strip}</AText>
                </LinearGradient>
                <View style={{ alignItems: 'center', marginTop: -34, paddingHorizontal: 20, gap: 6 }}>
                  <View
                    style={{
                      width: 76,
                      height: 76,
                      borderRadius: 22,
                      backgroundColor: INK,
                      borderWidth: 3,
                      borderColor: '#f4f8f6',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <AText style={{ color: '#7fe6c8', fontSize: 26, fontFamily: amazen.font.sansMedium }}>{monogram(company)}</AText>
                  </View>
                  <AText
                    numberOfLines={1}
                    style={{
                      marginTop: 6,
                      color: '#4b5d57',
                      fontFamily: amazen.font.mono,
                      fontSize: 10.5,
                      letterSpacing: 2.2,
                      textTransform: 'uppercase',
                    }}
                  >
                    {company}
                  </AText>
                  <AText numberOfLines={1} style={{ color: INK, fontSize: 22, fontFamily: amazen.font.sans }}>{name}</AText>
                  {typeof role === 'string' ? <AText style={{ color: roleColor, fontSize: 13.5, textAlign: 'center' }}>{role}</AText> : role}
                </View>
                <Barcode />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 8 }}>
                  <AText style={{ color: '#6b7c76', fontFamily: amazen.font.mono, fontSize: 10, letterSpacing: 1 }}>{footLeft}</AText>
                  <AText style={{ color: '#6b7c76', fontFamily: amazen.font.mono, fontSize: 10, letterSpacing: 1 }}>{footRight}</AText>
                </View>
                {stamp ? (
                  <View
                    style={{
                      position: 'absolute',
                      right: 14,
                      top: 286,
                      transform: [{ rotate: '-12deg' }],
                      borderWidth: 2.5,
                      borderColor: stamp.tone === 'warn' ? '#a45d0f' : '#b3392c',
                      borderRadius: 8,
                      paddingHorizontal: 9,
                      paddingVertical: 4,
                      backgroundColor: '#f4f8f6e6',
                    }}>
                    <AText
                      style={{
                        color: stamp.tone === 'warn' ? '#a45d0f' : '#b3392c',
                        fontFamily: amazen.font.mono,
                        fontSize: 12,
                        letterSpacing: 2,
                      }}
                    >
                      {stamp.text}
                    </AText>
                  </View>
                ) : null}
              </>
            ) : null}
            <Slot />
          </LinearGradient>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** The punched slot the clip goes through. */
function Slot() {
  return (
    <View
      style={{
        position: 'absolute',
        top: 16,
        alignSelf: 'center',
        width: 58,
        height: 12,
        borderRadius: 6,
        backgroundColor: `${INK}22`,
      }}
    />
  );
}

/** A barcode — decorative; a pass without one reads as a sticker. */
function Barcode() {
  const bars = [
    2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 1, 3, 2, 1, 2, 1, 3, 1, 1, 2, 1, 2,
    3, 1, 1, 2, 1, 3, 1, 2, 1,
  ];
  return (
    <View style={{ flexDirection: 'row', height: 34, marginTop: 12, marginHorizontal: 26, gap: 2, overflow: 'hidden', opacity: 0.85 }}>
      {bars.map((w, i) => <View key={i} style={{ width: w, backgroundColor: i % 2 === 0 ? INK : 'transparent' }} />)}
    </View>
  );
}
