import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { SPACING, FONT_SIZE, FONT_WEIGHT } from '../../lib/constants';

/**
 * How the site is doing, in one number.
 *
 * The dashboard used to open with a greeting and a roster and answer nothing —
 * a supervisor could not tell from it whether anybody was working. This is the
 * answer: how many of the crew are on shift right now, with one capsule per
 * person beneath it, so "who is missing" is a glance rather than a count.
 *
 * Everything here is DERIVED from data the screen already holds — the roster it
 * is allowed to see and the attendance the server already scoped to its spaces.
 * It fetches nothing, and it cannot show a person the viewer was not given.
 */

/** Capsules are per person; past this a phone row turns into a grey smear. */
const MAX_CAPSULES = 14;

export interface SitePulseProps {
  /** People rostered in the spaces this viewer can see. */
  total: number;
  /** How many of them are clocked in right now. */
  onShift: number;
  /** Expected but not yet in — drawn as an outline, not a gap. */
  late?: number;
  /** One line under the number: what the count MEANS right now. */
  caption?: string;
}

export const SitePulse = React.memo(function SitePulse({ total, onShift, late = 0, caption }: SitePulseProps) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();

  /*
    One capsule per person, in three states, computed once.

    Rendered from counts rather than from the people themselves: the bar says
    how many, never who, so it needs no names and leaks nothing when the viewer
    holds attendance for a space whose roster they cannot read.
  */
  const capsules = useMemo(() => {
    const shown = Math.min(Math.max(total, onShift), MAX_CAPSULES);
    const on = Math.min(onShift, shown);
    const waiting = Math.min(late, Math.max(0, shown - on));
    return Array.from({ length: shown }, (_, i) =>
      i < on ? 'on' : i < on + waiting ? 'late' : 'off',
    );
  }, [total, onShift, late]);

  /*
    The dot breathes only while somebody is actually working.

    A pulse that never stops is decoration; one that starts when the first
    person clocks in tells you something from across a room. Driven by
    Animated with the native driver, so it costs nothing on the JS thread.
  */
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (onShift === 0) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 2600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [onShift, pulse]);

  const live = onShift > 0;
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.8] });
  const ringFade = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <View style={s.wrap}>
      {/* Ambient light behind the number — emerald when the site is working,
          a cool graphite when it is not. Absolute and non-interactive. */}
      <LinearGradient
        pointerEvents="none"
        colors={
          live
            ? ['rgba(16,185,129,0.22)', 'rgba(16,185,129,0.06)', 'transparent']
            : isDark
              ? ['rgba(99,102,241,0.10)', 'rgba(99,102,241,0.03)', 'transparent']
              : ['rgba(5,150,105,0.07)', 'rgba(5,150,105,0.02)', 'transparent']
        }
        start={{ x: 0.05, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={s.glow}
      />

      <View style={s.labelRow}>
        <View style={s.dotWrap}>
          {live && (
            <Animated.View
              style={[s.dotRing, { transform: [{ scale: ringScale }], opacity: ringFade }]}
            />
          )}
          <View style={[s.dot, { backgroundColor: live ? COLOR_ON : colors.borderLight }]} />
        </View>
        <Text style={[s.label, { color: colors.textMuted }]}>{t('home.pulse.onShiftNow')}</Text>
      </View>

      <View style={s.numberRow}>
        <Text
          style={[
            s.number,
            { color: live ? COLOR_ON : colors.textPrimary },
            live && s.numberLit,
          ]}
        >
          {onShift}
        </Text>
        <Text style={[s.of, { color: colors.textMuted }]}>/ {total}</Text>
      </View>

      <View style={s.bar}>
        {capsules.map((state, i) => (
          <View
            key={i}
            style={[
              s.capsule,
              { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.07)' },
              state === 'on' && s.capsuleOn,
              state === 'late' && s.capsuleLate,
            ]}
          />
        ))}
      </View>

      {!!caption && <Text style={[s.caption, { color: colors.textSecondary }]}>{caption}</Text>}
    </View>
  );
});

const COLOR_ON = '#10b981';
const COLOR_LATE = '#f59e0b';

const s = StyleSheet.create({
  wrap: { paddingTop: SPACING.lg, paddingBottom: SPACING.lg, position: 'relative' },
  glow: {
    position: 'absolute',
    left: -SPACING.xl,
    right: -SPACING.xl,
    top: -SPACING.xl,
    height: 260,
    borderRadius: 200,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  dotWrap: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotRing: { position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: COLOR_ON },
  label: { fontSize: 10.5, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: FONT_WEIGHT.bold },
  numberRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm, marginTop: SPACING.md },
  number: { fontSize: 84, lineHeight: 84, fontWeight: '800', letterSpacing: -4 },
  // A glow the platform can actually draw: a text shadow, not a filter.
  numberLit: { textShadowColor: 'rgba(16,185,129,0.45)', textShadowOffset: { width: 0, height: 6 }, textShadowRadius: 22 },
  of: { fontSize: 26, fontWeight: '800', letterSpacing: -1, paddingBottom: 10 },
  bar: { flexDirection: 'row', gap: 5, height: 9, marginTop: SPACING.lg },
  capsule: { flex: 1, borderRadius: 99 },
  capsuleOn: {
    backgroundColor: COLOR_ON,
    shadowColor: COLOR_ON,
    shadowOpacity: 0.6,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  capsuleLate: { backgroundColor: 'rgba(245,158,11,0.16)', borderWidth: 1.5, borderColor: COLOR_LATE },
  caption: { fontSize: FONT_SIZE.sm, marginTop: SPACING.md, letterSpacing: -0.1 },
});
