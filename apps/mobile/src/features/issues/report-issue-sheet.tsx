import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../island/island-context';
import { useOffline } from '../../offline/offline-context';
import { reportIssueFromPhone } from '../../offline/issues/issue-actions';
import { shiftIssuesApi, type ShiftIssue } from '../../lib/api/shift-issues';
import { useImagePicker, type PickedImage } from '../../hooks/useImagePicker';
import { BlurSheet } from '../../components/blur-sheet';
import { SheetPanel } from '../../components/sheet-panel';
import { AText, Eyebrow, LiveDot } from '../../components/amazen';
import { severityShown, severityTone } from '../home/issue-status';
import { MAX_PHOTOS, SEVERITY_KEYS, uploadPhotos } from './photos';
import { useReportIssueSheet } from './use-report-issue-sheet';
import { Sent, Field } from './report-issue-sheet-helpers';

/**
 * REPORT AN ISSUE — the form, and the acknowledgement that did not exist.
 *
 * ⚠️ THE PRIMARY IS JADE, NOT RED (rule 8). Red means destructive. A member
 * unsure whether a fault is worth reporting already hesitates; a red button
 * confirms the hesitation, and the report that does not get filed is the one
 * that mattered.
 *
 * ⚠️ SEVERITY IS NEUTRAL UNTIL IT IS NOT. Only `HIGH` and `URGENT` take
 * colour. Four coloured pills turn the choice into a mood ring and leave no
 * emphasis for the one that needs it.
 *
 * ⚠️ SHOW THE CONTEXT THAT IS ALREADY BEING SENT. `create()` takes
 * `timeEntryId` and `spaceId` — the shift and the workspace travel with every
 * issue and nothing on screen said so. Saying it BEFORE they type changes what
 * they write: nobody repeats "at the office, on my morning shift" once they
 * can see it is already attached.
 *
 * ⚠️ ONE PHOTO BUTTON, NOT TWO. Camera and gallery were two buttons side by
 * side, which asks a decision before the one that matters.
 */
export function ReportIssueSheet({
  visible,
  onClose,
  timeEntryId,
  spaceId,
  workspace,
  since,
  initialTitle,
  initialDescription,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  timeEntryId?: string;
  spaceId?: string;
  /** The workspace this is filed against — shown, because it is being sent. */
  workspace?: string | null;
  /** When the shift started — shown for the same reason. */
  since?: string | null;
  /** A report the app has already written for them — a refused clock-in says what was refused, when, and why. */
  initialTitle?: string;
  initialDescription?: string;
  /** The thread, once the member asks to open it. */
  onCreated: (id: string) => void;
}) {
  const {
    amazen,
    t,
    c,
    title,
    setTitle,
    description,
    setDescription,
    severity,
    setSeverity,
    picked,
    setPicked,
    busy,
    sent,
    reset,
    close,
    submit,
    addPhoto,
  } = useReportIssueSheet({ visible, onClose, timeEntryId, spaceId, workspace, since, initialTitle, initialDescription, onCreated });

  if (sent) {
    return (
      <BlurSheet visible={visible} onClose={close}>
        <SheetPanel onClose={close}>
          <Sent
            issue={sent.issue}
            queued={sent.queued}
            onDone={close}
            onOpenThread={() => { const id = sent.issue?.id; reset(); if (id) onCreated(id); }}
          />
        </SheetPanel>
      </BlurSheet>
    );
  }

  const canSend = !!title.trim() && !busy;

  return (
    <BlurSheet visible={visible} onClose={close}>
      <SheetPanel onClose={close}>
        <AText variant="h2" tone="strong" style={{ fontWeight: '300' }}>
          {t('issues.report', { defaultValue: 'Report an issue' })}
        </AText>

        {/* ⚠️ The context that is ALREADY being sent, said before they type. */}
        {workspace || since ? (
          <View
            style={{
              flexDirection: 'row', alignItems: 'flex-start', gap: amazen.space(3),
              marginTop: amazen.space(4),
              backgroundColor: c.tile, borderRadius: amazen.radius.field,
              paddingVertical: amazen.space(3), paddingHorizontal: amazen.space(4),
            }}
          >
            <View style={{ marginTop: 6 }}><LiveDot color={c.accent} live={false} /></View>
            <AText variant="caption" tone="muted" style={{ flex: 1 }}>
              {[
                workspace,
                since ? t('issues.onShiftSince', { time: since, defaultValue: `on shift since ${since}` }) : null,
              ].filter(Boolean).join(' · ')}
              {'\n'}
              {t('issues.travelsWith', { defaultValue: 'this goes with the report' })}
            </AText>
          </View>
        ) : null}

        <Field
          value={title}
          onChangeText={setTitle}
          placeholder={t('issues.titlePlaceholder', { defaultValue: 'What is stopping you?' })}
          maxLength={200}
        />

        <Eyebrow tone="muted" style={{ marginTop: amazen.space(4) }}>
          {t('issues.howBadly', { defaultValue: 'HOW BADLY' })}
        </Eyebrow>
        <View style={{ flexDirection: 'row', gap: amazen.space(2), marginTop: amazen.space(2) }}>
          {SEVERITY_KEYS.map((k) => {
            const on = severity === k;
            /*
              ⚠️ COLOUR ONLY AT `HIGH` AND ABOVE — AND SELECTION IS NOT COLOUR.

              The first cut filled the SELECTED pill with jade whatever it was,
              which put `MEDIUM` — the default nobody chose — in the brightest
              colour on the sheet. Below HIGH the selected pill is a neutral
              raised one: an outline and full-strength ink, which says "this is
              the one" without saying anything about how bad it is.
            */
            const hue = severityTone(k);
            const hot = !!hue;
            const fill = hue === 'critical' ? c.critical : c.warn;
            const ink = hue === 'critical' ? c.criticalInk : c.warnInk;
            const fg = on ? (hot ? ink : c.inkStrong) : c.inkMuted;
            const bg = on && hot ? fill : c.tile;
            return (
              <Pressable
                key={k}
                onPress={() => setSeverity(k)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => ({
                  flex: 1, alignItems: 'center',
                  paddingVertical: amazen.space(2.5),
                  borderRadius: amazen.radius.full,
                  backgroundColor: bg,
                  borderWidth: 1.5,
                  borderColor: on ? (hot ? fill : c.inkStrong) : 'transparent',
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <AText variant="caption" style={{ color: fg, fontFamily: amazen.font.sansMedium }}>
                  {t(`issues.severity.${k}`, { defaultValue: k })}
                </AText>
              </Pressable>
            );
          })}
        </View>

        <Field
          value={description}
          onChangeText={setDescription}
          placeholder={t('issues.descriptionPlaceholder', { defaultValue: 'Anything that would help (optional)' })}
          multiline
          maxLength={2000}
        />

        {picked.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: amazen.space(3) }}>
            {picked.map((p, i) => (
              <Pressable
                key={`${p.uri}:${i}`}
                onPress={() => setPicked((prev) => prev.filter((_, idx) => idx !== i))}
                accessibilityRole="button"
                accessibilityLabel={t('common.remove', { defaultValue: 'Remove' })}
                style={{ marginRight: amazen.space(2) }}
              >
                <Image source={{ uri: p.uri }} style={{ width: 56, height: 56, borderRadius: amazen.radius.tile }} />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <Pressable
          onPress={addPhoto}
          disabled={picked.length >= MAX_PHOTOS}
          accessibilityRole="button"
          style={({ pressed }) => ({
            marginTop: amazen.space(3),
            paddingVertical: amazen.space(3),
            alignItems: 'center',
            borderRadius: amazen.radius.field,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: c.lineField,
            opacity: picked.length >= MAX_PHOTOS ? 0.35 : pressed ? 0.7 : 1,
          })}
        >
          <AText variant="caption" tone="muted">
            {`＋  ${t('issues.addPhoto', { defaultValue: 'Add a photo' })}`}
          </AText>
        </Pressable>

        {/*
          ⚠️ JADE, NOT RED — rule 8. And the caption under it is a fact about
          what happens next, which is what a member hesitating over Send needs.
          ⚠️ IT NAMES NOBODY IT CANNOT NAME: routing is server-side (rule 12)
          and the phone must not re-derive who gets this.
        */}
        <Pressable
          onPress={() => void submit()}
          disabled={!canSend}
          accessibilityRole="button"
          style={({ pressed }) => ({
            marginTop: amazen.space(5),
            paddingVertical: amazen.space(3.5),
            alignItems: 'center',
            borderRadius: amazen.radius.full,
            backgroundColor: c.accentSolid,
            opacity: !canSend ? 0.45 : pressed ? 0.85 : 1,
          })}
        >
          <AText variant="body" style={{ color: c.accentInk, fontFamily: amazen.font.sansMedium }}>
            {busy ? t('common.sending', { defaultValue: 'Sending…' }) : t('issues.send', { defaultValue: 'Send' })}
          </AText>
        </Pressable>
        <AText variant="caption" tone="muted" style={{ textAlign: 'center', marginTop: amazen.space(2) }}>
          {t('issues.sendHint', { defaultValue: 'The people responsible for this workspace are notified straight away.' })}
        </AText>
      </SheetPanel>
    </BlurSheet>
  );
}
