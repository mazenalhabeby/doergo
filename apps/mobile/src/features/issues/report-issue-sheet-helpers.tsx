import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { type ShiftIssue } from '../../lib/api/shift-issues';
import { AText } from '../../components/amazen';
import { severityShown, severityTone } from '../home/issue-status';

/** ReportIssueSheet's module-level helpers, moved here unchanged so its sections can read them too. */
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
export function Sent({
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
      {/*
        A ring with a tick, not a filled disc. A solid jade circle at 72pt is
        the loudest thing this app draws and it belongs to a PRIMARY ACTION —
        spending it on an acknowledgement leaves nothing louder for the button
        underneath, which is the thing the member is meant to press next.
      */}
      <View
        style={{
          width: 72, height: 72, borderRadius: amazen.radius.full,
          borderWidth: 2, borderColor: c.accent,
          backgroundColor: c.accentTint,
          alignItems: 'center', justifyContent: 'center',
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
              <AText
                variant="caption"
                tone={severityTone(issue.severity) === 'critical' ? 'critical' : 'warn'}
                style={{ fontFamily: amazen.font.sansMedium }}
              >
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
export function Field({
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
