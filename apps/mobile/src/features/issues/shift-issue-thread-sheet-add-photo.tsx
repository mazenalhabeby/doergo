import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AText } from '@/components/amazen';
import type { ShiftIssueThreadSheetState } from './use-shift-issue-thread-sheet';

/** Part of ShiftIssueThreadSheet's markup, moved here unchanged; it reads the page's state from `vm`. */
export function ShiftIssueThreadSheetAddPhoto({ vm }: { vm: ShiftIssueThreadSheetState }) {
  const {
    amazen,
    addPhoto,
    t,
    c,
    draft,
    setDraft,
    send,
    busy,
    picked,
    viewing,
    issue,
  } = vm;
  if ((viewing)) return null;
  if ((!issue)) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2), marginTop: amazen.space(3) }}>
      <Pressable
        onPress={addPhoto}
        accessibilityRole="button"
        accessibilityLabel={t('issues.addPhoto', { defaultValue: 'Add a photo' })}
        hitSlop={8}
        style={{
          width: 40, height: 40, borderRadius: amazen.radius.full,
          backgroundColor: c.tile, alignItems: 'center', justifyContent: 'center',
        }}
      >
        <AText variant="body" tone="ink">＋</AText>
      </Pressable>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder={t('issues.replyPlaceholder', { defaultValue: 'Reply…' })}
        placeholderTextColor={c.inkMuted}
        multiline
        style={{
          flex: 1,
          backgroundColor: c.sunken,
          borderRadius: amazen.radius.field,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: c.lineField,
          paddingHorizontal: amazen.space(3),
          paddingVertical: amazen.space(2),
          color: c.inkStrong,
          fontFamily: amazen.font.sans,
          fontSize: 15,
          maxHeight: 96,
        }}
      />
      <Pressable
        onPress={() => void send()}
        disabled={busy || (!draft.trim() && picked.length === 0)}
        accessibilityRole="button"
        accessibilityLabel={t('issues.send', { defaultValue: 'Send' })}
        style={({ pressed }) => ({
          width: 40, height: 40, borderRadius: amazen.radius.full,
          backgroundColor: c.accentSolid, alignItems: 'center', justifyContent: 'center',
          opacity: busy || (!draft.trim() && picked.length === 0) ? 0.4 : pressed ? 0.85 : 1,
        })}
      >
        <AText variant="body" style={{ color: c.accentInk }}>➤</AText>
      </Pressable>
    </View>
  );
}
