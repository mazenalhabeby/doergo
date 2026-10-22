import React from 'react';
import { Image, Linking, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ChatAttachment } from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import { AText } from '@/components/amazen';
import { InkIcon } from '@/components/amazen/ink-icon';

/**
 * The files in a message. A photo draws at its real shape (from the upload's
 * width/height, so the thread does not jump). A link is the server's
 * short-lived one; a message from the phone's offline copy has none yet, so it
 * shows the name until the conversation is read online.
 */
export function ChatFiles({ items }: { items: ChatAttachment[] }) {
  const { t } = useTranslation();
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View style={{ gap: 6, marginTop: 4 }}>
      {items.map((a) => {
        const photo = a.mimeType?.startsWith('image/');
        const open = a.url ? () => void Linking.openURL(a.url!) : undefined;
        if (photo && a.url) {
          const ratio = a.width && a.height ? a.width / a.height : 4 / 3;
          return (
            <Pressable key={a.fileKey} onPress={open} accessibilityRole="imagebutton" accessibilityLabel={a.fileName}>
              <Image
                source={{ uri: a.url }}
                style={{ width: 220, maxWidth: '100%', aspectRatio: ratio, borderRadius: 12, backgroundColor: c.tile }}
                resizeMode="cover"
              />
            </Pressable>
          );
        }
        return (
          <Pressable
            key={a.fileKey}
            onPress={open}
            disabled={!open}
            accessibilityRole="button"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              borderRadius: 12,
              paddingHorizontal: 10,
              paddingVertical: 8,
              backgroundColor: c.tile,
            }}
          >
            <InkIcon name={photo ? 'attach' : 'file'} size={18} />
            <AText variant="caption" tone="strong" numberOfLines={1} style={{ flexShrink: 1, fontSize: 12.5 }}>
              {a.fileName}
            </AText>
            {!a.url ? (
              <AText variant="caption" tone="muted" style={{ fontSize: 11 }}>
                {t('chat.fileOnline', 'online')}
              </AText>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
