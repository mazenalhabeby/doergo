import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { AText } from '../amazen';

interface Fact {
  label: string;
  value: string;
  tone?: 'warn';
}

/** `.facts` — When, Where, Workspace, Who, From. A row with no value is not drawn. */
export function JobFacts({ facts }: { facts: Fact[] }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const shown = facts.filter((f) => f.value);
  if (!shown.length) return null;
  return (
    <View
      style={{
        backgroundColor: c.tile,
        borderRadius: 18,
        paddingVertical: amazen.space(3),
        paddingHorizontal: amazen.space(3.5),
        gap: amazen.space(2),
      }}>
      {shown.map((f) => (
        <View key={f.label} style={{ flexDirection: 'row', gap: amazen.space(3) }}>
          <AText variant="caption" tone="muted" numberOfLines={1} style={{ width: 84, fontSize: 12.5, lineHeight: 18 }}>{f.label}</AText>
          <AText
            variant="caption"
            numberOfLines={3}
            style={{ flex: 1, fontSize: 12.5, lineHeight: 18, color: f.tone === 'warn' ? c.warn : c.inkStrong }}
          >
            {f.value}
          </AText>
        </View>
      ))}
    </View>
  );
}

/**
 * `.map` — a still picture of where the job is. It does not pan or zoom: it is
 * a doorway, and a tap opens the phone's own maps app, which does both better.
 *
 * ⚠️ The map takes no touches (`pointerEvents="none"`) and a Pressable lies
 * over it, so a scroll that starts on the map scrolls the page.
 */
export function JobMap({ lat, lng, title, onOpen }: { lat: number; lng: number; title?: string | null; onOpen: () => void }) {
  const { amazen, isDark } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={{ height: 130, borderRadius: 18, overflow: 'hidden', backgroundColor: amazen.color.sunken }}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <MapView
          style={StyleSheet.absoluteFill}
          initialRegion={{ latitude: lat, longitude: lng, latitudeDelta: 0.006, longitudeDelta: 0.006 }}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          liteMode={Platform.OS === 'android'}
          userInterfaceStyle={isDark ? 'dark' : 'light'}
        >
          <Marker coordinate={{ latitude: lat, longitude: lng }} title={title ?? undefined} />
        </MapView>
      </View>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={t('job.more.maps')}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
