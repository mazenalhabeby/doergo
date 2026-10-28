import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  agreedLine,
  agreedLineKey,
  approvalTags,
  joinNamesFor,
  stepNoticeKind,
  stepNoticeVars,
  type ApprovalItem,
} from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import { AText, Pill } from '@/components/amazen';
import { minutesText } from './approval-minutes-text';

/** The detail's step notice, on a tint: which sentence is the shared `stepNoticeKind`, the words are the phone's. */
export function StepNotice({ step }: { step: NonNullable<ApprovalItem['step']> }) {
  const { t, i18n } = useTranslation();
  const { amazen } = useTheme();
  // Every approver, joined the reader's way; a role nobody can name → "an administrator" in their language.
  const vars = stepNoticeVars(step, {
    anAdministrator: t('approvals.step.anAdministrator'),
    joinNames: joinNamesFor(i18n.language),
  });
  return (
    <View
      style={{ backgroundColor: amazen.color.accentTint, borderRadius: amazen.radius.panel, padding: amazen.space(3) }}
    >
      <AText variant="body" tone="strong" style={{ fontSize: 13.5 }}>
        {t(`approvals.step.${stepNoticeKind(step)}`, vars)}
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
  // One whole sentence per case (shared `agreedLineKey`) — never two strings glued, word order differs by language.
  return (
    <AText variant="caption" tone="muted">
      {t(`approvals.step.${agreedLineKey(line)}`, { name: line.who ?? '', time: minutesText(line.minutes, t) })}
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
