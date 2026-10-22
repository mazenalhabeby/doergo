import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';
import { useImagePicker, type PickedImage } from '@/hooks/use-image-picker';
import { useTimeFormat } from '@/hooks/use-time-format';
import { ActionPill, AText, Sunken, JobField, Pill, ReceiptRow, RoundButton, StateEyebrow } from '@/components/amazen';
import { JobSheet } from '../job/job-ui';
import { CameraGlyph, CloseGlyph, GalleryGlyph, SendGlyph } from '../job/job-glyphs';
import { DayBar } from '../time/day-bar';
import { useWorklog } from './use-worklog';
import type { WorklogItem } from '@/offline/attendance/worklog';
import { formatDuration } from '@hbcfield/shared/client';
import { useWorkLogSheet, type WorkLogShift } from './use-work-log-sheet';
import { QUICK, NoteRow } from './work-log-sheet-helpers';
import { LoadingLine } from '@/components/loading-line';

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
  const {
    amazen,
    c,
    t,
    pickFromGallery,
    takePhoto,
    log,
    draft,
    setDraft,
    picked,
    setPicked,
    busy,
    viewer,
    setViewer,
    clock,
    start,
    running,
    now,
    end,
    marks,
    send,
    addPhotos,
    eyebrow,
  } = useWorkLogSheet({ visible, onClose, timeEntryId, editable, shift });

  return (
    <JobSheet
      visible={visible}
      onClose={onClose}
      busy={busy}
      eyebrow={eyebrow}
      title={running ? t('worklog.title', 'What I did today') : t('worklog.titlePast', 'Activity for this shift')}
    >
      {viewer ? (
        <Pressable
          onPress={() => setViewer(null)}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          style={{ alignItems: 'center', gap: amazen.space(2) }}>
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
                  <Pill
                    label={t(`time.approval.${shift.approval}`, { defaultValue: shift.approval })}
                    tone={
                      shift.approval === 'APPROVED' ? 'accent' : shift.approval === 'REJECTED' ? 'critical' : 'warn'
                    }
                  />
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
            <LoadingLine />
          ) : log.notes.length === 0 ? (
            <View style={{ gap: 4, paddingVertical: amazen.space(2) }}>
              <AText variant="body" tone="strong">
                {editable
                  ? t('worklog.empty', 'Nothing noted yet')
                  : t('worklog.emptyPast', 'Nothing was noted on this shift.')}
              </AText>
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
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: amazen.space(1.5) }}
                keyboardShouldPersistTaps="handled">
                {QUICK.map((k) => (
                  <ActionPill
                    key={k}
                    label={t(`worklog.quick.${k}`)}
                    onPress={() => setDraft((d) => (d.trim() ? `${d.trim()} · ` : '') + t(`worklog.quick.${k}`))}
                  />
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
                        style={{
                          position: 'absolute',
                          top: -6,
                          right: -6,
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          backgroundColor: c.well,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <CloseGlyph size={12} color={c.inkStrong} />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              ) : null}

              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: amazen.space(1.5) }}>
                <RoundButton
                  Glyph={CameraGlyph}
                  label={t('worklog.camera', 'Take a photo')}
                  size={42}
                  disabled={picked.length >= 5}
                  onPress={async () => {
                    const p = await takePhoto('worklog-photo');
                    if (p) addPhotos([p]);
                  }}
                />
                <RoundButton
                  Glyph={GalleryGlyph}
                  label={t('worklog.gallery', 'Choose photos')}
                  size={42}
                  disabled={picked.length >= 5}
                  onPress={async () => addPhotos(await pickFromGallery('worklog-photo'))}
                />
                <JobField
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={t('worklog.placeholder', 'What did you just finish?')}
                  multiline
                  maxLength={2000}
                  style={{ flex: 1, minHeight: 42, paddingVertical: amazen.space(2.5) }}
                />
                <RoundButton
                  Glyph={SendGlyph}
                  tone="jade"
                  size={42}
                  label={t('worklog.add', 'Add note')}
                  disabled={busy || (!draft.trim() && picked.length === 0)}
                  onPress={() => void send()}
                />
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
