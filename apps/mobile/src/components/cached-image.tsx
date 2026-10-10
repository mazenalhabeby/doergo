import React from 'react';
import { Image as RNImage, type ImageStyle, type StyleProp } from 'react-native';
import { expoImage } from '../lib/optional-native';

/**
 * A remote picture that is fetched once and kept — avatars above all, which
 * every list, header and chat row draws again and again.
 *
 * React Native's `<Image>` keeps no disk cache on Android and only a small
 * memory one, so the same colleague's photo was downloaded again on every
 * screen that drew them. expo-image keeps it in memory AND on disk.
 *
 * ⚠️ Safe because uploaded avatars get a NEW file name on every upload
 * (`avatars/{user}/{Date.now()}.{ext}`) — a cached file can never be a stale
 * picture under the same address.
 *
 * Loaded through `optional-native.ts`: on a binary without it, React Native's
 * Image draws exactly what it drew before.
 */
export function CachedImage({
  uri,
  style,
  contentFit = 'cover',
}: {
  uri: string;
  style?: StyleProp<ImageStyle>;
  contentFit?: 'cover' | 'contain';
}) {
  const lib = expoImage();
  if (lib) {
    const ExpoImage = lib.Image;
    return (
      <ExpoImage
        source={{ uri }}
        style={style as never}
        contentFit={contentFit}
        cachePolicy="memory-disk"
        recyclingKey={uri}
        transition={0}
      />
    );
  }
  return <RNImage source={{ uri }} style={style} resizeMode={contentFit} />;
}
