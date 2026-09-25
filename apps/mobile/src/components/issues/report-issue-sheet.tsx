import React, { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../contexts/toast-context';
import { useOffline } from '../../offline/offline-context';
import { reportIssueFromPhone } from '../../offline/issues/issue-actions';
import { shiftIssuesApi, type ShiftIssue } from '../../lib/api/shift-issues';
import { useImagePicker, type PickedImage } from '../../hooks/useImagePicker';
import { BlurSheet } from '../blur-sheet';
import { SheetPanel } from '../sheet-panel';
import { AText, Eyebrow, LiveDot } from '../amazen';
import { severityShown } from '../home/issue-status';
import { MAX_PHOTOS, SEVERITY_KEYS, uploadPhotos } from './photos';

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
  /** The thread, once the member asks to open it. */
  onCreated: (id: string) => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const toast = useToast();
  const offline = useOffline();
  const { pickFromGallery, takePhoto } = useImagePicker();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<string>('MEDIUM');
  const [picked, setPicked] = useState<PickedImage[]>([]);
  const [busy, setBusy] = useState(false);
  /** ⚠️ §5 — the state that did not exist. Null while the form is up. */
  const [sent, setSent] = useState<{ issue: ShiftIssue | null; queued: boolean } | null>(null);

  const reset = useCallback(() => {
    setTitle(''); setDescription(''); setSeverity('MEDIUM'); setPicked([]); setSent(null);
  }, []);

  const close = useCallback(() => { reset(); onClose(); }, [reset, onClose]);

  const submit = useCallback(async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      if (offline.engine && offline.files) {
        // Saved on the phone first; the issue and its photos send themselves.
        const { issueId, outcome } = await reportIssueFromPhone(offline.engine, offline.files, {
          title: title.trim(),
          description: description.trim() || undefined,
          severity,
          timeEntryId,
          spaceId,
          photos: picked.map((p) => ({ uri: p.uri, fileName: p.fileName, mimeType: p.mimeType, width: p.width, height: p.height })),
        });
        if (outcome.kind === 'refused') {
          toast.error(
            t('common.error'),
            (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) || outcome.message || t('common.error'),
          );
          return;
        }
        /*
          ⚠️ OFFLINE GETS THE SAME SHEET, READING `Queued`. The app is
          offline-first and this form gave no indication at all: a member in a
          basement tapped Send, the sheet closed, and nothing said whether
          anybody would ever see it.
        */
        setSent({
          issue: outcome.kind === 'done'
            ? ({ id: issueId, title: title.trim(), severity, status: 'OPEN' } as ShiftIssue)
            : ({ id: issueId, title: title.trim(), severity, status: 'OPEN' } as ShiftIssue),
          queued: outcome.kind !== 'done',
        });
        return;
      }
      const issue = await shiftIssuesApi.create({
        title: title.trim(), description: description.trim() || undefined, severity, timeEntryId, spaceId,
      });
      if (picked.length) {
        const attachments = await uploadPhotos(issue.id, picked);
        if (attachments.length) {
          try { await shiftIssuesApi.message(issue.id, { body: '', attachments }); } catch { /* the issue is filed */ }
        }
      }
      setSent({ issue, queued: false });
    } catch {
      /* the client reports its own failures */
    } finally {
      setBusy(false);
    }
  }, [title, description, severity, timeEntryId, spaceId, picked, offline.engine, offline.files, t, toast]);

  const addPhoto = useCallback(async () => {
    /*
      ⚠️ ONE BUTTON. The picker asks camera-or-library itself where the
      platform offers it; on a phone with no camera it simply opens the
      library, which is the right answer and not a second control.
    */
    const img = await takePhoto('issue-photo');
    if (img) { setPicked((p) => [...p, img].slice(0, MAX_PHOTOS)); return; }
    const imgs = await pickFromGallery('issue-photo');
    if (imgs.length) setPicked((p) => [...p, ...imgs].slice(0, MAX_PHOTOS));
  }, [takePhoto, pickFromGallery]);

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
            const hot = severityShown(k);
            const fg = on ? (hot ? c.warnInk : c.inkStrong) : c.inkMuted;
            const bg = on && hot ? c.warn : c.tile;
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
                  borderColor: on ? (hot ? c.warn : c.inkStrong) : 'transparent',
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

/**
 * §5 — SENT. A state that did not exist.
 *
 * The form submitted and returned the member to the card with NO
 * acknowledgement: no confirmation, no copy of what they filed, and nothing
 * saying who now has it.
 *
 * ⚠️ NAMING WHO HAS IT IS THE POINT. *"Your responsible person is notified"*
 * is a promise; a name is a fact. When the server tells us the name, it is
 * said; when it does not, the sheet says what it actually knows rather than
 * inventing a person — the phone never re-derives routing (rule 12).
 */
function Sent({
  issue,
  queued,
  onDone,
  onOpenThread,
}: {
  issue: ShiftIssue | null;
  queued: boolean;
  onDone: () => void;
  onOpenThread: () => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const who = issue?.assigneeName?.trim() || null;

  return (
    <View style={{ alignItems: 'center' }}>
      <View
        style={{
          width: 72, height: 72, borderRadius: amazen.radius.full,
          backgroundColor: c.accentTint, alignItems: 'center', justifyContent: 'center',
          marginTop: amazen.space(2),
        }}
      >
        <AText variant="h2" tone="accent">✓</AText>
      </View>

      <AText variant="h2" tone="strong" style={{ marginTop: amazen.space(3), fontWeight: '300' }}>
        {queued ? t('issues.queuedTitle', { defaultValue: 'Queued' }) : t('issues.sentTitle', { defaultValue: 'Sent' })}
      </AText>

      <AText variant="caption" tone="muted" style={{ textAlign: 'center', marginTop: amazen.space(2) }}>
        {queued
          ? t('issues.queuedBody', { defaultValue: 'It will go out as soon as you have signal.' })
          : who
            ? t('issues.sentBodyNamed', { name: who, defaultValue: `${who} has it. You will see their reply here.` })
            : t('issues.sentBody', { defaultValue: 'The people responsible for this workspace have it. You will see their reply here.' })}
      </AText>

      {/* The issue AS FILED — so nobody has to remember what they typed. */}
      {issue ? (
        <View
          style={{
            alignSelf: 'stretch',
            marginTop: amazen.space(5),
            backgroundColor: c.well,
            borderRadius: amazen.radius.panel,
            padding: amazen.space(4),
            gap: 4,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
            {severityShown(issue.severity) ? (
              <AText variant="caption" tone="warn" style={{ fontFamily: amazen.font.sansMedium }}>
                {t(`issues.severity.${issue.severity}`, { defaultValue: issue.severity })}
              </AText>
            ) : null}
            <AText variant="caption" tone="muted">
              {queued
                ? t('issues.reads.queued', { defaultValue: 'Queued' })
                : t('issues.reads.openJustNow', { defaultValue: 'Open · just now' })}
            </AText>
          </View>
          <AText variant="body" tone="strong">{issue.title}</AText>
        </View>
      ) : null}

      <Pressable
        onPress={onDone}
        accessibilityRole="button"
        style={({ pressed }) => ({
          alignSelf: 'stretch',
          marginTop: amazen.space(5),
          paddingVertical: amazen.space(3.5),
          alignItems: 'center',
          borderRadius: amazen.radius.full,
          backgroundColor: c.accentSolid,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <AText variant="body" style={{ color: c.accentInk, fontFamily: amazen.font.sansMedium }}>
          {t('common.done', { defaultValue: 'Done' })}
        </AText>
      </Pressable>

      {/*
        ⚠️ A TEXT BUTTON, NOT A SECOND PRIMARY. The common act after filing is
        going back to work; opening the thread is the quieter one.
        Queued has no thread to open yet — the issue is not on the server.
      */}
      {!queued ? (
        <Pressable onPress={onOpenThread} accessibilityRole="button" hitSlop={8} style={{ marginTop: amazen.space(3) }}>
          <AText variant="caption" tone="accent">
            {t('issues.openThread', { defaultValue: 'Open the thread' })}
          </AText>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A `sunken` field — the surface for something you put things INTO. */
function Field({
  value, onChangeText, placeholder, multiline, maxLength,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  multiline?: boolean;
  maxLength?: number;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={c.inkMuted}
      multiline={multiline}
      maxLength={maxLength}
      style={{
        marginTop: amazen.space(4),
        backgroundColor: c.sunken,
        borderRadius: amazen.radius.field,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: c.lineField,
        paddingHorizontal: amazen.space(4),
        paddingVertical: amazen.space(3),
        color: c.inkStrong,
        fontFamily: amazen.font.sans,
        fontSize: 15,
        height: multiline ? 96 : undefined,
        textAlignVertical: multiline ? 'top' : 'center',
      }}
    />
  );
}
