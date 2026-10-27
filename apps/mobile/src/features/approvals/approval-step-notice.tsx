import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ApprovalItem } from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import { AText, Pill } from '@/components/amazen';
import { minutesText } from './approval-minutes-text';
import { approvalTags, stepNoticeText } from './approval-step-words';

/** The detail's step notice, on a tint. */
export function StepNotice({ step }: { step: NonNullable<ApprovalItem['step']> }) {
  const { t } = useTranslation();
  const { amazen } = useTheme();
  return (
    <View
      style={{ backgroundColor: amazen.color.accentTint, borderRadius: amazen.radius.panel, padding: amazen.space(3) }}
    >
      <AText variant="body" tone="strong" style={{ fontSize: 13.5 }}>
        {stepNoticeText(step, t)}
      </AText>
    </View>
  );
}

/**
 * Above the time field: what an earlier approver already agreed. The smallest agreed time counts, so the field
 * starts from it and says that typing less cuts it.
 */
export function AgreedTimeLine({ item }: { item: ApprovalItem }) {
  const { t } = useTranslation();
  const agreed = item.step?.agreedMinutes;
  if (!item.step || item.step.mine || typeof agreed !== 'number' || agreed <= 0) return null;
  return (
    <AText variant="caption" tone="warn">
      {t('approvals.step.agreed', { name: item.step.firstByName, time: minutesText(agreed, t) })}
    </AText>
  );
}

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
