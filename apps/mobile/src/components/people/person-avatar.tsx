import React from 'react';
import { Image, View } from 'react-native';
import { useTheme } from '../../contexts/theme-context';
import { resolveMediaUrl } from '../../lib/api';
import { AText } from '../amazen';

export type Presence = 'AVAILABLE' | 'BUSY' | 'AWAY' | string | null | undefined;

/** One colour per state, the same everywhere a person is drawn. */
export const PRESENCE_DOT: Record<string, string> = { AVAILABLE: '#22c55e', BUSY: '#ef4444', AWAY: '#f59e0b' };
export const presenceKey = (p: Presence): 'AVAILABLE' | 'BUSY' | 'AWAY' | 'OFF' =>
  p === 'AVAILABLE' || p === 'BUSY' || p === 'AWAY' ? p : 'OFF';

/**
 * A person, drawn: their photo, or their initials on jade, with a presence dot.
 *
 * ⚠️ ONE DRAWING FOR TEAM AND CHAT. The two screens each had their own avatar
 * — one a multi-coloured gradient, one a flat circle — so the same colleague
 * looked like two different people a tap apart.
 */
export function PersonAvatar({
  person,
  size = 44,
  presence,
  ring,
}: {
  person?: { firstName?: string | null; lastName?: string | null; avatarUrl?: string | null } | null;
  size?: number;
  /** Omit for no dot. */
  presence?: Presence;
  /** The surface under the dot — the dot's ring punches it out. */
  ring?: string;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const img = resolveMediaUrl(person?.avatarUrl);
  const initials = `${person?.firstName?.[0] ?? ''}${person?.lastName?.[0] ?? ''}`.toUpperCase() || '·';
  const dot = Math.max(10, Math.round(size * 0.28));
  return (
    <View style={{ width: size, height: size }}>
      {img ? (
        <Image source={{ uri: img }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.tile }} />
      ) : (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.accentTint, alignItems: 'center', justifyContent: 'center' }}>
          <AText style={{ color: c.accent, fontFamily: amazen.font.sansMedium, fontSize: Math.round(size * 0.32) }}>{initials}</AText>
        </View>
      )}
      {presence !== undefined ? (
        <View
          style={{
            position: 'absolute', right: -1, bottom: -1, width: dot, height: dot, borderRadius: dot / 2,
            backgroundColor: PRESENCE_DOT[presenceKey(presence)] ?? c.lineField,
            borderWidth: 2.5, borderColor: ring ?? c.well,
          }}
        />
      ) : null}
    </View>
  );
}
