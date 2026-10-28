import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { agreedLine, approvalTags, stepNoticeKind, type ApprovalItem } from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import { AText, Pill } from '@/components/amazen';
import { minutesText } from './approval-minutes-text';

/** The detail's step notice, on a tint: which sentence is the shared `stepNoticeKind`, the words are the phone's. */
export function StepNotice({ step }: { step: NonNullable<ApprovalItem['step']> }) {
  const { t } = useTranslation();
  const { amazen } = useTheme();
  return (
    <View
      style={{ backgroundColor: amazen.color.accentTint, borderRadius: amazen.radius.panel, padding: amazen.space(3) }}
    >
      <AText variant="body" tone="strong" style={{ fontSize: 13.5 }}>
        {t(`approvals.step.${stepNoticeKind(step)}`, { name: step.firstByName, role: step.roleName })}
      </AText>
    </View>
  );
}

/**
 * Above the time field: what was agreed so far (shared `agreedLine`). Named when one person agreed; "a smaller
 * time here counts instead" only when it does — never for an administrator, whose decision stands as given.
 */
export function AgreedTimeLine({ item }: { item: ApprovalItem }) {
  const { t } = useTranslation();
  const line = agreedLine(item.step);
  if (!line) return null;
  const time = minutesText(line.minutes, t);
  const said = line.who
    ? t('approvals.step.agreed', { name: line.who, time })
    : t('approvals.step.agreedSoFar', { time });
  return (
    <AText variant="caption" tone="warn">
      {line.smallerCounts ? `${said}${t('approvals.step.smallerCounts')}` : said}
    </AText>
  );
}

/** The words of an item's marks (shared `approvalTags`), in their order — the pills and the screen reader's label. */
export function approvalTagWords(item: ApprovalItem, t: (k: string) => string): string[] {
  return approvalTags(item).map((k) => t(`approvals.tag.${k}`));
}

/** The marks as pills — the caller's row lays them out (they wrap beside other pills). */
export function ApprovalTags({ item }: { item: ApprovalItem }) {
  const { t } = useTranslation();
  const tags = approvalTags(item);
  if (!tags.length) return null;
  return (
    <>
      {tags.map((k) => (
        <Pill key={k} label={t(`approvals.tag.${k}`)} tone={k === 'waitsForYou' ? 'accent' : 'neutral'} />
      ))}
    </>
  );
}
