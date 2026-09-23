import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/theme-context';

/**
 * The ground every v2 screen stands on.
 *
 * ⚠️ There are TWO gradients and they are not interchangeable. The home one's
 * top stop is lighter, which is why `inkOnGlassHome` exists as a token of its
 * own — text that passes on the interior ground fails on the home one at
 * 4.14:1. Pass the variant; never eyeball it.
 *
 * ⚠️ NO STATUS BAR IS EVER DRAWN. The gradient runs under it, and screens use
 * `layout.topInset` (56) rather than a safe-area background band.
 */
export function Ground({
  variant = 'interior',
  style,
  children,
  ...rest
}: ViewProps & { variant?: 'home' | 'interior' }) {
  const { amazen } = useTheme();
  const g = amazen.gradient;
  const colors = variant === 'home' ? g.home : g.interior;
  const locations = variant === 'home' ? g.homeLocations : g.interiorLocations;

  return (
    <View style={[styles.root, { backgroundColor: amazen.color.canvas }, style]} {...rest}>
      <LinearGradient
        colors={colors as unknown as [string, string, ...string[]]}
        locations={locations as unknown as [number, number, ...number[]]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
