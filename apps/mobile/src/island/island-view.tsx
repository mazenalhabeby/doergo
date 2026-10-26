import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextLayoutEventData,
  type NativeSyntheticEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  runOnJS,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from '@/components/amazen/ink-icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ISLAND, TONES, type Tone } from './tokens';
import { FONT } from '../theme/amazen';
import { impact } from '../lib/haptics';
import {
  CAP,
  DROP_SIDE,
  EDGE,
  MAX_BODY_LINES,
  ICON,
  ICON_GAP,
  SIDE,
  readLayout,
  sealedBox,
  sealedVisible,
  type Cutout,
  type Layout,
  type Measured,
} from './geometry';
import { useIslandView, type IslandMessage } from './use-island-view';
import { lineWidth, Glyph, styles } from './island-view-helpers';
export { type IslandMessage } from './use-island-view';

export function IslandView({
  hole,
  screenW,
  message,
  onDismiss,
  onSwipeAway,
  reduceMotion,
}: {
  hole: Cutout;
  screenW: number;
  message: IslandMessage | null;
  onDismiss: (id: number) => void;
  /** Swipe up closes it early. */
  onSwipeAway: (msg: IslandMessage) => void;
  reduceMotion: boolean;
}) {
  const {
    sealed,
    idle,
    pending,
    widths,
    body,
    commit,
    capW,
    boxStyle,
    headStyle,
    bodyStyle,
    msg,
    layout,
    swipe,
    look,
  } = useIslandView({ hole, screenW, message, onDismiss, onSwipeAway, reduceMotion });

  return (
    <>
      {/*
        The measuring layer. ⚠️ Off-screen and never visible: it exists so the
        rung can be decided from real text metrics before the first frame of
        the morph.
      */}
      {pending ? (
        <View
          style={styles.measure}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text
            style={styles.title}
            onTextLayout={(e) => {
              widths.current.title = lineWidth(e);
              maybeCommit();
            }}
          >
            {pending.title}
          </Text>
          {pending.title ? (
            <Text
              style={[styles.title, { width: capW - DROP_SIDE * 2 }]}
              onTextLayout={(e) => {
                widths.current.titleWrapped = e.nativeEvent.lines.length;
                maybeCommit();
              }}
            >
              {pending.title}
            </Text>
          ) : null}
          <Text
            style={styles.value}
            onTextLayout={(e) => {
              widths.current.value = lineWidth(e);
              maybeCommit();
            }}
          >
            {pending.value ?? ''}
          </Text>
          {pending.body ? (
            <Text
              style={[styles.body, { width: capW - DROP_SIDE * 2 }]}
              onTextLayout={(e) => {
                widths.current.bodyLines = e.nativeEvent.lines.length;
                maybeCommit();
              }}
            >
              {pending.body}
            </Text>
          ) : null}
        </View>
      ) : null}

      {!msg && !idle ? null : (
        <View style={styles.stage} pointerEvents="box-none">
          <GestureDetector gesture={swipe}>
            <Animated.View
              style={[styles.island, { top: layout?.open.y ?? sealed.y }, boxStyle]}
              pointerEvents={msg ? 'auto' : 'none'}
            >
              {msg && layout ? (
                <View
                  accessibilityRole={msg.action ? 'button' : 'alert'}
                  accessibilityLabel={[msg.title, msg.value, msg.body].filter(Boolean).join('. ')}
                  accessibilityHint="Swipe up to dismiss"
                  style={StyleSheet.absoluteFill}
                >
                  {/*
                The head row, in the band the lens sits in: icon LEFT of the
                lens, time RIGHT of it. The ladder already decided both fit.
              */}
                  <Animated.View
                    style={[styles.headRow, { marginTop: layout.headTop, height: layout.headHeight }, headStyle]}
                  >
                    {layout.icon === 'left' ? <Glyph tone={msg.tone} fg={look.fg} /> : <View style={{ width: 0 }} />}
                    {!layout.titleDrops && msg.title ? (
                      <Text numberOfLines={1} style={[styles.title, { color: ISLAND.ink }]}>
                        {msg.title}
                      </Text>
                    ) : null}
                    {/* ⚠️ The lens is in here. Left group hugs the left edge, the time the right. */}
                    <View style={{ flex: 1 }} />
                    {msg.value ? (
                      <Text numberOfLines={1} style={styles.value}>
                        {msg.value}
                      </Text>
                    ) : null}
                    {layout.icon === 'right' ? <Glyph tone={msg.tone} fg={look.fg} /> : null}
                  </Animated.View>

                  {/* ⚠️ What did not fit beside the lens goes UNDER it; the height was decided for it. */}
                  {layout.titleDrops || msg.body || msg.action ? (
                    <Animated.View style={[styles.drop, bodyStyle]}>
                      {layout.titleDrops ? <Text style={styles.title}>{msg.title}</Text> : null}
                      {msg.body ? (
                        <Text numberOfLines={MAX_BODY_LINES} style={[styles.body, !msg.title && styles.bodyAlone]}>
                          {msg.body}
                        </Text>
                      ) : null}
                      {msg.action ? (
                        <Pressable onPress={msg.action.onPress} accessibilityRole="button" style={styles.action}>
                          <Text style={[styles.actionLabel, { color: look.fg }]}>{msg.action.label}</Text>
                        </Pressable>
                      ) : null}
                    </Animated.View>
                  ) : null}
                </View>
              ) : null}
            </Animated.View>
          </GestureDetector>
        </View>
      )}
    </>
  );

  /** Both (or all three) measurements are in — decide and go. */
  function maybeCommit() {
    const p = pending;
    if (!p) return;
    if (p.body && widths.current.bodyLines === 0) return;
    if (p.title.length > 0 && (widths.current.title === 0 || widths.current.titleWrapped === 0)) return;
    if (p.value && widths.current.value === 0) return;
    commit(p);
  }
}
