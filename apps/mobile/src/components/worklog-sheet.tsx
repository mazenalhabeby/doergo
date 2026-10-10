import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { useImagePicker, type PickedImage } from '../hooks/useImagePicker';
import { useTimeFormat } from '../hooks/useTimeFormat';
import { AText, Sunken } from './amazen';
import { JobField, JobSheet, Pill, ReceiptRow, RoundButton, StateEyebrow } from './job/job-ui';
import { CameraGlyph, CloseGlyph, GalleryGlyph, SendGlyph } from './job/job-glyphs';
import { DayBar } from './time/day-bar';
import { useWorklog } from './worklog/use-worklog';
import type { WorklogItem } from '../offline/attendance/worklog';
import { formatDuration } from '@hbcfield/shared/client';

const isImg = (m: string) => m.startsWith('image/');
/** Phrases a note usually starts with — one tap puts them in the box, where they can still be edited. */
const QUICK = ['finished', 'waitingParts', 'handedOver', 'cleanedUp'] as const;

interface WorkLogShift {
  workspace: string | null;
  clockInAt: string;
  /** Null while the shift is running. */
  clockOutAt: string | null;
  tz?: string | null;
  /** The counted figure, on a finished shift. Never called "paid". */
  countedMinutes?: number | null;
  approval?: 'PENDING' | 'APPROVED' | 'REJECTED' | string | null;
}

/**
 * A shift's work log — what was done, note by note, drawn on the shift itself.
 *
 * The same object in two states: the running shift ("What I did today"),
 * where a note can be added, and a finished one ("Activity for this shift"),
 * read-only with the shift's receipt on top. The notes sit on a rail like a
 * job's activity, and the bar above marks where in the day each one was.
 *
 * ⚠️ THE DATA IS `useWorklog`, SHARED WITH THE TODAY CARD — see that file.
 * ⚠️ THE PHOTO PREVIEW IS IN THE SHEET, NOT A MODAL OF ITS OWN. There is one
 * Modal slot in this app (`blur-sheet.tsx`); a second one beside the sheet is
 * refused by UIKit and the tap does nothing at all.
 */
export function WorkLogSheet({
  visible,
  onClose,
  timeEntryId,
  editable = false,
  shift,
}: {
  visible: boolean;
  onClose: () => void;
  timeEntryId: string;
  /** Only the running shift can be written to; a finished one is read. */
  editable?: boolean;
  shift: WorkLogShift;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const { formatClock: formatTime, formatDateRelative } = useTimeFormat();
  const { pickFromGallery, takePhoto } = useImagePicker();
  const log = useWorklog(timeEntryId, visible);

  const [draft, setDraft] = useState('');
  const [picked, setPicked] = useState<PickedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  useEffect(() => { if (!visible) setViewer(null); }, [visible]);

  const tz = shift.tz ?? undefined;
  const clock = (iso: string) => formatTime(iso, tz);
  const start = new Date(shift.clockInAt);
  const running = !shift.clockOutAt;
  /*
    ⚠️ A RUNNING SHIFT'S BAR ENDS AT THE LATER OF NOW AND THE LAST NOTE, never
    at a guessed shift end — "now" is the one end that is a fact.
  */
  const now = new Date();
  const end = shift.clockOutAt ? new Date(shift.clockOutAt) : now;
  const marks = useMemo(() => log.notes.map((n) => ({ at: new Date(n.at), pending: !!n.pendingSync })), [log.notes]);

  const send = async () => {
    if (busy || (!draft.trim() && picked.length === 0)) return;
    setBusy(true);
    const ok = await log.add(draft, picked);
    setBusy(false);
    if (ok) { setDraft(''); setPicked([]); }
  };
  const addPhotos = (imgs: PickedImage[]) => setPicked((p) => [...p, ...imgs].slice(0, 5));

  const eyebrow = running
    ? <StateEyebrow tone="accent" live label={[t('shiftClock.onTheClock', 'On the clock'), shift.workspace].filter(Boolean).join(' · ')} />
    : <StateEyebrow label={[t('worklog.done', 'Done'), formatDateRelative(shift.clockInAt, tz), shift.workspace].filter(Boolean).join(' · ')} />;

  return (
    <JobSheet
      visible={visible}
      onClose={onClose}
      busy={busy}
      eyebrow={eyebrow}
      title={running ? t('worklog.title', 'What I did today') : t('worklog.titlePast', 'Activity for this shift')}
    >
      {viewer ? (
        <Pressable onPress={() => setViewer(null)} accessibilityRole="button" accessibilityLabel={t('common.close')} style={{ alignItems: 'center', gap: amazen.space(2) }}>
          <Image source={{ uri: viewer }} resizeMode="contain" style={{ width: '100%', height: 360, borderRadius: 18 }} />
          <AText variant="caption" tone="muted">{t('worklog.tapToClose', 'Tap to close')}</AText>
        </Pressable>
      ) : (
        <>
          {running ? null : (
            <Sunken style={{ padding: amazen.space(3.5), gap: amazen.space(2) }}>
              <ReceiptRow label={t('shiftEnd.clockedIn', 'Clocked in')} value={clock(shift.clockInAt)} />
              <ReceiptRow label={t('shiftEnd.clockedOut', 'Clocked out')} value={clock(shift.clockOutAt!)} />
              {shift.countedMinutes != null ? (
                <View style={{ borderTopWidth: 1, borderTopColor: c.lineWell, paddingTop: amazen.space(2) }}>
                  <ReceiptRow strong label={t('shiftEnd.countedTotal', 'Counted')} value={formatDuration(shift.countedMinutes)} />
                </View>
              ) : null}
              {shift.approval ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <AText variant="caption" tone="muted" style={{ fontSize: 13.5 }}>{t('worklog.status', 'Status')}</AText>
                  <Pill label={t(`time.approval.${shift.approval}`, { defaultValue: shift.approval })} tone={shift.approval === 'APPROVED' ? 'accent' : shift.approval === 'REJECTED' ? 'critical' : 'warn'} />
                </View>
              ) : null}
            </Sunken>
          )}

          <DayBar
            start={start}
            end={end}
            marks={marks}
            filled={1}
            labels={[
              clock(shift.clockInAt),
              running
                ? t('worklog.nowAt', { defaultValue: 'now {{time}}', time: clock(now.toISOString()) })
                : log.notes.length ? t('worklog.count', { count: log.notes.length, defaultValue: '{{count}} notes' }) : '',
              running ? '' : clock(shift.clockOutAt!),
            ]}
          />

          {log.loading && log.notes.length === 0 ? (
            <AText variant="caption" tone="muted">{t('common.loading', 'Loading…')}</AText>
          ) : log.notes.length === 0 ? (
            <View style={{ gap: 4, paddingVertical: amazen.space(2) }}>
              <AText variant="body" tone="strong">{editable ? t('worklog.empty', 'Nothing noted yet') : t('worklog.emptyPast', 'Nothing was noted on this shift.')}</AText>
              {editable ? (
                <AText variant="caption" tone="muted" style={{ fontSize: 13, lineHeight: 18 }}>
                  {t('worklog.hint', 'Note what you finish through the shift — it becomes your clock-out summary.')}
                </AText>
              ) : null}
            </View>
          ) : (
            <View>
              {log.notes.map((n, i) => (
                <NoteRow
                  key={n.id}
                  note={n}
                  time={clock(n.at)}
                  last={i === log.notes.length - 1}
                  canRemove={editable && !n.pendingSync}
                  onRemove={() => void log.remove(n.id)}
                  onOpenPhoto={setViewer}
                />
              ))}
            </View>
          )}

          {editable ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: amazen.space(1.5) }} keyboardShouldPersistTaps="handled">
                {QUICK.map((k) => (
                  <Pressable
                    key={k}
                    onPress={() => setDraft((d) => (d.trim() ? `${d.trim()} · ` : '') + t(`worklog.quick.${k}`))}
                    accessibilityRole="button"
                    style={({ pressed }) => ({ borderRadius: amazen.radius.full, paddingHorizontal: amazen.space(3), paddingVertical: amazen.space(1.75), backgroundColor: c.tile, opacity: pressed ? 0.75 : 1 })}
                  >
                    <AText variant="caption" tone="ink" style={{ fontSize: 12.5 }}>{t(`worklog.quick.${k}`)}</AText>
                  </Pressable>
                ))}
              </ScrollView>

              {picked.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: amazen.space(1.5) }}>
                  {picked.map((p, i) => (
                    <View key={`${p.uri}-${i}`}>
                      <Image source={{ uri: p.uri }} style={{ width: 58, height: 58, borderRadius: 12 }} />
                      <Pressable
                        onPress={() => setPicked((prev) => prev.filter((_, idx) => idx !== i))}
                        accessibilityRole="button"
                        accessibilityLabel={t('worklog.removePhoto', 'Remove photo')}
                        hitSlop={8}
                        style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <CloseGlyph size={12} color={c.inkStrong} />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              ) : null}

              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: amazen.space(1.5) }}>
                <RoundButton Glyph={CameraGlyph} label={t('worklog.camera', 'Take a photo')} size={42} disabled={picked.length >= 5} onPress={async () => { const p = await takePhoto('worklog-photo'); if (p) addPhotos([p]); }} />
                <RoundButton Glyph={GalleryGlyph} label={t('worklog.gallery', 'Choose photos')} size={42} disabled={picked.length >= 5} onPress={async () => addPhotos(await pickFromGallery('worklog-photo'))} />
                <JobField
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={t('worklog.placeholder', 'What did you just finish?')}
                  multiline
                  maxLength={2000}
                  style={{ flex: 1, minHeight: 42, paddingVertical: amazen.space(2.5) }}
                />
                <RoundButton Glyph={SendGlyph} tone="jade" size={42} label={t('worklog.add', 'Add note')} disabled={busy || (!draft.trim() && picked.length === 0)} onPress={() => void send()} />
              </View>
              <AText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
                {t('worklog.footer', 'Becomes your clock-out summary')}
              </AText>
            </>
          ) : null}
        </>
      )}
    </JobSheet>
  );
}

/** One note on the rail: time, dot, what was done, its photos. */
function NoteRow({
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
        <View style={{ width: 9, height: 9, borderRadius: 5, marginTop: 6, backgroundColor: pending ? 'transparent' : c.accent, borderWidth: pending ? 2 : 0, borderColor: c.warn }} />
        {last ? null : <View style={{ width: 2, flex: 1, minHeight: 14, backgroundColor: c.lineWell }} />}
      </View>
      <View style={{ flex: 1, paddingBottom: amazen.space(3.5), gap: amazen.space(1.5) }}>
        {note.byManager ? (
          <AText variant="caption" tone="accent" numberOfLines={1}>
            {note.author?.name ? t('worklog.addedBy', { defaultValue: 'Added by {{name}}', name: note.author.name }) : t('worklog.addedByManager', 'Added by a manager')}
          </AText>
        ) : null}
        <AText variant="body" tone="strong" style={{ fontSize: 14, lineHeight: 20 }}>{note.body}</AText>
        {note.attachments.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(1.5) }}>
            {note.attachments.map((a) =>
              isImg(a.mimeType) ? (
                <Pressable key={a.id} onPress={() => onOpenPhoto(a.url ?? a.fileUrl)} accessibilityRole="imagebutton" accessibilityLabel={a.fileName}>
                  <Image source={{ uri: a.url ?? a.fileUrl }} style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: c.tile }} />
                </Pressable>
              ) : (
                <View key={a.id} style={{ borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: c.tile, maxWidth: 160 }}>
                  <AText variant="caption" tone="ink" numberOfLines={1}>{a.fileName}</AText>
                </View>
              ),
            )}
          </View>
        ) : null}
        {pending ? <AText variant="caption" tone="warn" numeric>{t('offline.chip.waiting')}</AText> : null}
      </View>
      {canRemove ? (
        <Pressable onPress={onRemove} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('worklog.remove', 'Remove note')} style={{ paddingTop: 4 }}>
          <CloseGlyph size={14} color={c.inkMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}
