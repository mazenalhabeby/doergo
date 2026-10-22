import { Image, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';
import { AText } from '@/components/amazen';
import { CloseGlyph } from '../job/job-glyphs';
import type { WorklogItem } from '@/offline/attendance/worklog';

/** WorkLogSheet's module-level helpers, moved here unchanged so its sections can read them too. */
export const isImg = (m: string) => m.startsWith('image/');

/** Phrases a note usually starts with — one tap puts them in the box, where they can still be edited. */
export const QUICK = ['finished', 'waitingParts', 'handedOver', 'cleanedUp'] as const;

/** One note on the rail: time, dot, what was done, its photos. */
export function NoteRow({
  note, time, last, canRemove, onRemove, onOpenPhoto,
}: {
  note: WorklogItem;
  time: string;
  last: boolean;
  canRemove: boolean;
  onRemove: () => void;
  onOpenPhoto: (uri: string) => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const pending = !!note.pendingSync;
  return (
    <View style={{ flexDirection: 'row', gap: amazen.space(2) }}>
      <AText variant="caption" tone="muted" numeric style={{ width: 44, paddingTop: 3 }}>{time}</AText>
      <View style={{ width: 12, alignItems: 'center' }}>
        {/* ⚠️ Hollow amber: on the phone, not at the office yet. Solid jade: sent. */}
        <View
          style={{
            width: 9,
            height: 9,
            borderRadius: 5,
            marginTop: 6,
            backgroundColor: pending ? 'transparent' : c.accent,
            borderWidth: pending ? 2 : 0,
            borderColor: c.warn,
          }}
        />
        {last ? null : <View style={{ width: 2, flex: 1, minHeight: 14, backgroundColor: c.lineWell }} />}
      </View>
      <View style={{ flex: 1, paddingBottom: amazen.space(3.5), gap: amazen.space(1.5) }}>
        {note.byManager ? (
          <AText variant="caption" tone="accent" numberOfLines={1}>
            {note.author?.name
              ? t('worklog.addedBy', { defaultValue: 'Added by {{name}}', name: note.author.name })
              : t('worklog.addedByManager', 'Added by a manager')}
          </AText>
        ) : null}
        <AText variant="body" tone="strong" style={{ fontSize: 14, lineHeight: 20 }}>{note.body}</AText>
        {note.attachments.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(1.5) }}>
            {note.attachments.map((a) =>
              isImg(a.mimeType) ? (
                <Pressable
                  key={a.id}
                  onPress={() => onOpenPhoto(a.url ?? a.fileUrl)}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={a.fileName}>
                  <Image
                    source={{ uri: a.url ?? a.fileUrl }}
                    style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: c.tile }}
                  />
                </Pressable>
              ) : (
                <View
                  key={a.id}
                  style={{
                    borderRadius: 10,
                    paddingHorizontal: 8,
                    paddingVertical: 6,
                    backgroundColor: c.tile,
                    maxWidth: 160,
                  }}>
                  <AText variant="caption" tone="ink" numberOfLines={1}>{a.fileName}</AText>
                </View>
              ),
            )}
          </View>
        ) : null}
        {pending ? <AText variant="caption" tone="warn" numeric>{t('offline.chip.waiting')}</AText> : null}
      </View>
      {canRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('worklog.remove', 'Remove note')}
          style={{ paddingTop: 4 }}>
          <CloseGlyph size={14} color={c.inkMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}
