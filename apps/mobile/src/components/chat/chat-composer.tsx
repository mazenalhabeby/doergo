import React, { useEffect, useState } from 'react';
import { Alert, Image, Pressable, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CHAT_MAX_ATTACHMENTS } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useImagePicker, type PickedImage } from '../../hooks/useImagePicker';
import { AText } from '../amazen';
import { SendButton } from './chat-rows';
import Animated from 'react-native-reanimated';
import { InkIcon } from '../amazen/ink-icon';
import { useIconMotion } from '../amazen/motion';

/**
 * The box to write in: words, up to five photos (camera or library), Send.
 * In edit mode it holds your message and saves it instead. Words alone go
 * through the outbox (sent later with no signal); photos need the network.
 */
export function ChatComposer({
  placeholder,
  bottomPad,
  editing,
  onSend,
  onSaveEdit,
  onCancelEdit,
  onTyping,
  seed,
}: {
  /** A starter tapped in the empty conversation: put it in the box (sent only on Send). */
  seed?: { text: string; at: number } | null;
  placeholder: string;
  bottomPad: number;
  editing: { id: string; body: string } | null;
  onSend: (body: string, photos: PickedImage[]) => Promise<boolean>;
  onSaveEdit: (id: string, body: string) => void;
  onCancelEdit: () => void;
  onTyping: () => void;
}) {
  const { t } = useTranslation();
  const { amazen } = useTheme();
  const c = amazen.color;
  const { pickFromGallery, takePhoto } = useImagePicker();
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<PickedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const tilt = useIconMotion('tilt');

  useEffect(() => {
    if (editing) setText(editing.body);
  }, [editing]);
  useEffect(() => {
    if (seed) setText(seed.text);
  }, [seed]);

  const addPhotos = () => {
    const room = CHAT_MAX_ATTACHMENTS - photos.length;
    if (room <= 0) return;
    Alert.alert(t('chat.attach', 'Add a photo'), undefined, [
      {
        text: t('chat.camera', 'Take a photo'),
        onPress: () =>
          void takePhoto().then((p) => p && setPhotos((all) => [...all, p].slice(0, CHAT_MAX_ATTACHMENTS))),
      },
      {
        text: t('chat.library', 'Choose from library'),
        onPress: () =>
          void pickFromGallery('task-photo', room).then((ps) =>
            setPhotos((all) => [...all, ...ps].slice(0, CHAT_MAX_ATTACHMENTS)),
          ),
      },
      { text: t('common.cancel', 'Cancel'), style: 'cancel' },
    ]);
  };

  const submit = async () => {
    const body = text.trim();
    if (editing) {
      if (body) onSaveEdit(editing.id, body);
      setText('');
      return;
    }
    if ((!body && !photos.length) || busy) return;
    setBusy(true);
    setText('');
    const ok = await onSend(body, photos);
    setBusy(false);
    if (ok) setPhotos([]);
    else setText(body);
  };

  /*
    ONE floating glass capsule: the photo button, the words and Send — the
    composer reads as a single object over the conversation, not three loose
    controls. Edit mode and the picked photos sit just above it.
  */
  return (
    <View
      style={{ paddingHorizontal: amazen.space(3), paddingTop: amazen.space(1.5), paddingBottom: bottomPad, gap: 6 }}
    >
      {editing ? (
        <Pressable
          onPress={() => {
            setText('');
            onCancelEdit();
          }}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: c.glass,
            borderWidth: 1,
            borderColor: c.lineGlass,
          }}
        >
          <AText variant="caption" tone="ink">
            {t('chat.editing', 'Editing your message')}
          </AText>
          <AText variant="caption" tone="accent">
            {t('common.cancel', 'Cancel')}
          </AText>
        </Pressable>
      ) : null}
      {photos.length ? (
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 4 }}>
          {photos.map((p, i) => (
            <Pressable
              key={p.uri}
              onPress={() => setPhotos((all) => all.filter((_, j) => j !== i))}
              accessibilityLabel={t('common.remove', 'Remove')}
            >
              <Image
                source={{ uri: p.uri }}
                style={{ width: 52, height: 52, borderRadius: 12, borderWidth: 1, borderColor: c.lineGlass }}
              />
            </Pressable>
          ))}
        </View>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 6,
          padding: 5,
          borderRadius: 26,
          backgroundColor: c.glass,
          borderWidth: 1,
          borderColor: c.lineGlass,
          shadowColor: '#0b332a',
          shadowOpacity: 0.14,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 2,
        }}
      >
        {!editing ? (
          <Pressable
            onPressIn={tilt.play}
            onPress={addPhotos}
            accessibilityRole="button"
            accessibilityLabel={t('chat.attach', 'Add a photo')}
            hitSlop={6}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.tile,
              transform: [{ scale: pressed ? 0.92 : 1 }],
            })}
          >
            <Animated.View style={tilt.style}>
              <InkIcon name="attach" size={22} />
            </Animated.View>
          </Pressable>
        ) : null}
        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (!editing) onTyping();
          }}
          placeholder={placeholder}
          placeholderTextColor={c.inkMuted}
          multiline
          maxLength={4000}
          style={{
            flex: 1,
            maxHeight: 120,
            paddingHorizontal: 6,
            paddingTop: 10,
            paddingBottom: 10,
            color: c.inkStrong,
            fontFamily: amazen.font.sans,
            fontSize: 15,
          }}
        />
        <SendButton
          saving={!!editing}
          disabled={busy || (!text.trim() && !photos.length)}
          onPress={() => void submit()}
          label={editing ? t('common.save', 'Save') : t('chat.send', 'Send')}
        />
      </View>
    </View>
  );
}
