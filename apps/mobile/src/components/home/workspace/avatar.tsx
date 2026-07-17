import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getAvatarColors, type WorkerStatus } from './helpers';

const STATUS_COLOR: Record<WorkerStatus, string> = {
  on: '#10b981',   // Available / On shift — green
  busy: '#ef4444', // Busy — red
  away: '#f59e0b', // Away — amber
  off: '#8b8d98',  // Offline — grey
};

export interface AvatarProps {
  /** Stable id used to pick a deterministic gradient. */
  id: string;
  initials: string;
  imageUrl?: string | null;
  size?: number;
  /** When set, renders a status dot in the bottom-right corner. */
  status?: WorkerStatus;
  /** Border color for the status dot ring (match the surface behind it). */
  ringColor?: string;
}

/**
 * Single source of truth for rendering a person avatar (image or gradient
 * initials) with an optional status dot. Reused by person nodes, the activity
 * sheet, and the assign-member sheet (DRY).
 */
export const Avatar = React.memo(function Avatar({
  id,
  initials,
  imageUrl,
  size = 46,
  status,
  ringColor = '#1a1a24',
}: AvatarProps) {
  const [c1, c2] = getAvatarColors(id);
  const radius = size / 2;
  const fontSize = Math.max(10, Math.round(size * 0.33));
  const dotSize = Math.max(10, Math.round(size * 0.28));

  return (
    <View style={{ width: size, height: size }}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={{ width: size, height: size, borderRadius: radius }} />
      ) : (
        <LinearGradient
          colors={[c1, c2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.center, { width: size, height: size, borderRadius: radius }]}
        >
          <Text style={[styles.initials, { fontSize }]}>{initials}</Text>
        </LinearGradient>
      )}
      {status && (
        <View
          style={[
            styles.dot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: STATUS_COLOR[status],
              borderColor: ringColor,
            },
          ]}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#fff', fontWeight: '700' },
  dot: { position: 'absolute', bottom: 0, right: 0, borderWidth: 2 },
});
