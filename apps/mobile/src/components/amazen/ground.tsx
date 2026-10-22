import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/theme-context';

/**
 * The ground every v2 screen stands on — ONE gradient, the home's, on every
 * tab and every screen reached from one.
 *
 * ⚠️ THERE USED TO BE TWO. A darker "interior" gradient sat under Jobs, the job
 * page and New job, so moving between tabs changed the light, and every grey
 * written on glass had to know which ground it was on (`inkOnGlass` vs
 * `inkOnGlassHome`, 4.14:1 vs 5.28:1). One ground, one grey: nothing to pick.
 *
 * ⚠️ NO STATUS BAR IS EVER DRAWN. The gradient runs under it, and screens use
 * `layout.topInset` (56) rather than a safe-area background band.
 */
export function Ground({ style, children, ...rest }: ViewProps) {
  const { amazen } = useTheme();
  const g = amazen.gradient;
  return (
    <View style={[styles.root, { backgroundColor: amazen.color.canvas }, style]} {...rest}>
      <LinearGradient
        colors={g.ground as unknown as [string, string, ...string[]]}
        locations={g.groundLocations as unknown as [number, number, ...number[]]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
