import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useAuth } from '../../contexts/auth-context';
import { shiftIssuesApi, type ShiftIssue } from '../../lib/api/shift-issues';
import { BlurSheet } from '../blur-sheet';
import { SheetPanel } from '../sheet-panel';
import { AText, Chip, Eyebrow } from '../amazen';
import { groupIssues, lookFor, severityShown, severityTone, unreadFor } from '../home/issue-status';

/**
 * MY ISSUES — grouped by whether it is still yours to worry about.
 *
 * ⚠️ ALL SIX STATUSES, NOT TWO (rule 9). The sheet showed open-or-not and
 * threw the other four away, so `ACKNOWLEDGED` and `IN_PROGRESS` — the whole
 * reason somebody reports anything — never reached the person waiting. They
 * are the difference between a reporting tool and a suggestion box.
 *
 * ⚠️ SOLID MEANS IT STILL WANTS SOMETHING; HOLLOW MEANS IT DOES NOT. That is
 * the read at arm's length, before a single word, which is why the dot carries
 * it rather than the colour alone.
 *
 * ⚠️ SEVERITY AT `HIGH` AND ABOVE ONLY. Below that it is noise.
 *
 * ⚠️ THE BADGE IS UNREAD, NEVER A TOTAL (rule 10). `"5 updates"` is the wrong
 * number — a thread with five of the member's own messages has nothing waiting
 * in it. The question is whether anybody replied to *you*.
 *
 * ⚠️ EMPTY IS NOT THE SAME SENTENCE AS A FAILED FETCH. "Nothing reported" and
 * "we could not ask" look identical on a blank screen and mean opposite
 * things — one is good news.
 */
export function ShiftIssueListSheet({
  visible,
  onClose,
  onOpen,
  onReport,
}: {
  visible: boolean;
  onClose: () => void;
  onOpen: (id: string) => void;
  /** Absent when there is no shift to file against. */
  onReport?: () => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const { user } = useAuth();
  const c = amazen.color;

  const [issues, setIssues] = useState<ShiftIssue[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setIssues(await shiftIssuesApi.list());
    } catch {
      setIssues(null);
      setFailed(true);
    }
  }, []);

  useEffect(() => { if (visible) void load(); }, [visible, load]);

  const { open, done } = groupIssues(issues ?? []);

  return (
    <BlurSheet visible={visible} onClose={onClose}>
      <SheetPanel onClose={onClose}>
        <AText variant="h2" tone="strong" style={{ fontWeight: '300' }}>
          {t('issues.myIssues', { defaultValue: 'My issues' })}
        </AText>

        <ScrollView style={{ marginTop: amazen.space(3) }} showsVerticalScrollIndicator={false}>
          {issues === null ? (
            <AText variant="caption" tone="muted" style={{ marginTop: amazen.space(4) }}>
              {failed
                ? t('issues.couldNotLoad', { defaultValue: 'We could not reach your issues. Try again in a moment.' })
                : t('common.loading', { defaultValue: 'Loading…' })}
            </AText>
          ) : open.length === 0 && done.length === 0 ? (
            <AText variant="caption" tone="muted" style={{ marginTop: amazen.space(4) }}>
              {t('issues.none', { defaultValue: 'Nothing reported.' })}
            </AText>
          ) : (
            <>
              {open.length ? (
                <Section title={t('issues.stillOpen', { defaultValue: 'STILL OPEN' })} count={open.length}>
                  {open.map((i) => (
                    <Row key={i.id} issue={i} viewerId={user?.id} onPress={() => onOpen(i.id)} />
                  ))}
                </Section>
              ) : null}
              {done.length ? (
                <Section title={t('issues.doneGroup', { defaultValue: 'DONE' })} count={done.length}>
                  {done.map((i) => (
                    <Row key={i.id} issue={i} viewerId={user?.id} onPress={() => onOpen(i.id)} />
                  ))}
                </Section>
              ) : null}
            </>
          )}
        </ScrollView>

        {/* The primary is always there — including under "Nothing reported." */}
        {onReport ? (
          <Pressable
            onPress={onReport}
            accessibilityRole="button"
            style={({ pressed }) => ({
              marginTop: amazen.space(4),
              paddingVertical: amazen.space(3.5),
              alignItems: 'center',
              borderRadius: amazen.radius.full,
              backgroundColor: c.accentSolid,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <AText variant="body" style={{ color: c.accentInk, fontFamily: amazen.font.sansMedium }}>
              {`＋  ${t('issues.report', { defaultValue: 'Report an issue' })}`}
            </AText>
          </Pressable>
        ) : null}
      </SheetPanel>
    </BlurSheet>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const { amazen } = useTheme();
  return (
    <View style={{ marginTop: amazen.space(4) }}>
      <Eyebrow tone="muted">{`${title} · ${count}`}</Eyebrow>
      <View style={{ marginTop: amazen.space(2), gap: amazen.space(1) }}>{children}</View>
    </View>
  );
}

function Row({
  issue,
  viewerId,
  onPress,
}: {
  issue: ShiftIssue;
  viewerId: string | null | undefined;
  onPress: () => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const look = lookFor(issue.status);
  const unread = unreadFor(issue, viewerId);
  const who = issue.assigneeName?.trim() || '';
  const tone = look.tone === 'warn' ? c.warn : look.tone === 'accent' ? c.accent : c.inkMuted;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${issue.title}. ${t(look.readsAs, { name: who, defaultValue: issue.status })}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: amazen.space(3),
        paddingVertical: amazen.space(3),
        paddingHorizontal: amazen.space(3),
        borderRadius: amazen.radius.field,
        backgroundColor: pressed ? c.tile : 'transparent',
      })}
    >
      {/*
        ⚠️ SOLID WANTS SOMETHING, HOLLOW DOES NOT — and the ring is drawn as a
        ring rather than faked with opacity, because a 50% dot at arm's length
        is a dot.
      */}
      <View
        style={{
          width: 10, height: 10, borderRadius: 5, marginTop: 7,
          borderWidth: look.solid ? 0 : 2,
          borderColor: tone,
          backgroundColor: look.solid ? tone : 'transparent',
        }}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
          <AText
            variant="body"
            tone={look.open ? 'strong' : 'ink'}
            numberOfLines={1}
            style={{ flex: 1 }}
          >
            {issue.title}
          </AText>
          {/* ⚠️ Severity at HIGH and above only. */}
          {severityShown(issue.severity) ? (
            <Chip
              label={t(`issues.severity.${issue.severity}`, { defaultValue: issue.severity })}
              tone={severityTone(issue.severity) ?? 'neutral'}
            />
          ) : null}
          {/* ⚠️ Unread, never a total. */}
          {unread > 0 ? <Chip label={String(unread)} tone="accent" numeric /> : null}
        </View>
        <AText variant="caption" tone="muted" numberOfLines={1}>
          {t(look.readsAs, { name: who, defaultValue: issue.status })}
        </AText>
      </View>
    </Pressable>
  );
}
