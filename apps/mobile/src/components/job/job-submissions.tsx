import React from 'react';
import { Image, Pressable, View, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { parseStoredStepForm, personName } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import type { StepSubmission } from '../../lib/api';
import { AText, Well, WellDivider } from '../amazen';
import { SectionLabel } from './job-ui';
import { fieldLabel, shownAnswer } from './step-form-logic';
import { httpsUrl, openSafeUrl } from '../../lib/safe-links';

/**
 * "Reports" — the step forms this job was moved through, `GET /tasks/:id/submissions`.
 *
 * Each one is drawn from the form AS IT WAS ANSWERED (the snapshot the server
 * kept), so a workflow edited since never rewrites an old report: its labels,
 * its answers, its photos and signatures, who sent it and when.
 *
 * ⚠️ ASKED FOR ONLY WHEN IT IS SEEN: the page calls `onLayout` →
 * `loadSubmissions`. Until then — and when there are none — this is an empty
 * place on the page, not a header over nothing.
 */
export function JobSubmissions({
  submissions,
  labelOf,
  onLayout,
}: {
  submissions: StepSubmission[] | undefined | 'unreachable';
  /** A step's name in the workflow's words. */
  labelOf: (key: string) => string;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const { formatDateFull, formatTime } = useTimeFormat();

  if (submissions === undefined || (Array.isArray(submissions) && submissions.length === 0)) {
    return <View onLayout={onLayout} />;
  }

  return (
    <View onLayout={onLayout} style={{ gap: amazen.space(2) }}>
      <SectionLabel>{t('job.submissions.title')}</SectionLabel>
      {submissions === 'unreachable' ? (
        <AText variant="caption" tone="warn">{t('job.submissions.offline')}</AText>
      ) : (
        submissions.map((s) => {
          const form = parseStoredStepForm(s.form);
          const who = personName(s.submittedBy);
          const when = s.submittedAt ? `${formatDateFull(s.submittedAt, null)} ${formatTime(s.submittedAt, null)}` : '';
          const rows = (form?.fields ?? [])
            .map((f) => ({ f, a: shownAnswer(f, s.answers?.[f.id]) }))
            .filter((r) => r.a !== null);
          return (
            <Well key={s.id} style={{ paddingVertical: amazen.space(2.5), paddingHorizontal: amazen.space(3.5), gap: amazen.space(1) }}>
              <AText variant="body" tone="strong" numberOfLines={2} style={{ fontFamily: amazen.font.sansMedium, flexShrink: 1 }}>{labelOf(s.statusKey)}</AText>
              <AText variant="caption" tone="muted" numberOfLines={2}>
                {who ? t('job.submissions.byAt', { name: who, when }) : when}
              </AText>
              {rows.length === 0 ? (
                <AText variant="caption" tone="ink">{t('job.submissions.empty')}</AText>
              ) : rows.map(({ f, a }, i) => (
                <View key={f.id}>
                  {i > 0 ? <WellDivider /> : null}
                  <View style={{ gap: amazen.space(1), paddingVertical: amazen.space(1.5) }}>
                    <AText variant="caption" tone="muted" numberOfLines={2}>{fieldLabel(f, t)}</AText>
                    <Answer answer={a!} files={s.files ?? {}} />
                  </View>
                </View>
              ))}
            </Well>
          );
        })
      )}
    </View>
  );
}

function Answer({ answer, files }: { answer: NonNullable<ReturnType<typeof shownAnswer>>; files: StepSubmission['files'] }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const urlOf = (id: string) => files[id]?.url ?? files[id]?.fileUrl ?? null;

  switch (answer.kind) {
    case 'text':
      return <AText variant="body" tone="strong" style={{ fontSize: 14, lineHeight: 20 }}>{answer.text}</AText>;
    case 'yesno':
      return <AText variant="body" tone="strong" style={{ fontSize: 14, lineHeight: 20 }}>{answer.value ? t('common.yes') : t('common.no')}</AText>;
    case 'photos':
      return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {answer.ids.map((id) => {
            const url = urlOf(id);
            return (
              <Pressable
                key={id}
                onPress={() => { void openSafeUrl(httpsUrl(url)); }}
                disabled={!url}
                accessibilityRole="button"
                accessibilityLabel={files[id]?.fileName ?? t('job.submissions.photo')}
                style={({ pressed }) => ({ width: 64, height: 64, borderRadius: 14, overflow: 'hidden', backgroundColor: c.tile, opacity: pressed ? 0.8 : 1 })}
              >
                {url ? <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
              </Pressable>
            );
          })}
        </View>
      );
    case 'signature': {
      const url = urlOf(answer.id);
      return url ? (
        <View style={{ height: 64, borderRadius: 12, backgroundColor: '#ffffff', overflow: 'hidden', borderWidth: 1, borderColor: c.lineWell }}>
          {/* The signature is ink on white by construction — the pad paints white into the picture. */}
          <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
        </View>
      ) : (
        <AText variant="caption" tone="ink">{t('job.submissions.signed')}</AText>
      );
    }
  }
}
