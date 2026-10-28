import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { describeApproval, type ApprovalItem, type ApprovalT } from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import { formatDay } from '@/lib/money';
import { AText } from '@/components/amazen';
import { WellRow } from '../register/well-row';
import { approvalKey } from './approvals-store';
import { minutesText } from './approval-minutes-text';
import { ApprovalTags, approvalTagWords } from './approval-step-notice';

/**
 * One item in the inbox: who, what, where, the day it was raised. Its marks ("Waiting for you", "Dates already
 * passed") sit on their own wrapping row under the detail — beside the name they squeezed it on a small phone —
 * and are read out with the rest of the row.
 */
export function ApprovalItemRow({ item, first, last }: { item: ApprovalItem; first: boolean; last: boolean }) {
  const { amazen } = useTheme();
  const { t, i18n } = useTranslation();
  const tt = t as unknown as ApprovalT;
  const text = describeApproval(item, tt, i18n.language, undefined, (n) => minutesText(n, tt));
  const title = item.subject.name || t('approvals.someone');
  const detail = [
    text.headline,
    text.facts[0]?.value,
    item.space?.name,
    item.step ? t('approvals.step.short', { role: item.step.roleName }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const day = item.raisedAt ? formatDay(item.raisedAt, i18n.language) : '';
  const tags = approvalTagWords(item, t);
  return (
    <WellRow
      first={first}
      last={last}
      title={title}
      detail={detail}
      a11yLabel={[title, detail, ...tags, day].filter(Boolean).join(', ')}
      below={
        tags.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(1), marginTop: amazen.space(1) }}>
            <ApprovalTags item={item} />
          </View>
        ) : null
      }
      trailing={
        <AText variant="caption" tone="muted" numeric>
          {day}
        </AText>
      }
      onPress={() => router.push({ pathname: '/(app)/approval/[key]', params: { key: approvalKey(item) } } as never)}
    />
  );
}
