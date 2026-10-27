import React, { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  describeApproval,
  labelWord,
  type ApprovalDay,
  type ApprovalItem,
  type ApprovalT,
  kindNeedsMinutes,
} from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import { formatDay } from '@/lib/money';
import { approvalsApi } from '@/lib/api';
import { useToast } from '@/island/island-context';
import { refusalText } from '@/lib/distance';
import { AText, Chip, PrimaryButton } from '@/components/amazen';
import { WellRow } from '../register/well-row';
import { approvalKey } from './approvals-store';
import { minutesText } from './approval-duration';

/**
 * One person's working day in the inbox: who, which day, why it waits (shared
 * label words). A tap opens what it holds — each item one tap from its own
 * screen — and "Approve day" for what needs nothing more than a yes. Online only.
 */
export function ApprovalDayRow({
  day,
  members,
  onDone,
}: {
  day: ApprovalDay;
  members: ApprovalItem[];
  onDone: () => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const tt = t as unknown as ApprovalT;
  const toast = useToast();

  // One send at a time: a second tap while the first is on its way does nothing.
  const sending = useRef(false);
  const approve = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      const res = await approvalsApi.decideDay(day.approvable);
      const failed = res.results.find((r) => !r.ok);
      const waiting = res.results.find((r) => r.waitingFor);
      if (!failed && waiting) {
        toast.success(
          t('approvals.day.partly', { what: t(`approvals.kinds.${waiting.kind}`), role: waiting.waitingFor }),
        );
      } else if (failed) {
        toast.error(
          t('approvals.day.stopped', {
            what: t(`approvals.kinds.${failed.kind}`),
            reason: refusalText(t, failed, failed.code ?? ''),
          }),
        );
      } else {
        toast.success(t('approvals.day.approved', { name: day.subject.name || t('approvals.someone') }));
      }
      onDone();
    } catch (e) {
      toast.error(refusalText(t, (e ?? {}) as { code?: string; message?: string }, t('approvals.loadFailed')));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <View
      style={{
        backgroundColor: c.well,
        borderRadius: amazen.radius.panel,
        marginBottom: amazen.space(2),
        overflow: 'hidden',
      }}
    >
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ padding: amazen.space(3.5), gap: amazen.space(1.5) }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: amazen.space(2) }}>
          <AText variant="body" tone="strong" numberOfLines={1} style={{ flex: 1 }}>
            {day.subject.name || t('approvals.someone')}
          </AText>
          <AText variant="caption" tone="muted" numeric>
            {formatDay(`${day.localDate}T12:00:00Z`, i18n.language)}
          </AText>
        </View>
        <AText variant="caption" tone="muted">
          {[t('approvals.day.label'), t('approvals.day.count', { count: members.length }), day.space?.name]
            .filter(Boolean)
            .join(' · ')}
        </AText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(1) }}>
          {day.labels.map((code) => (
            <Chip key={code} label={labelWord(code, i18n.language)} tone="warn" />
          ))}
          {day.kinds.map((k) => (
            <Chip key={k} label={t(`approvals.kinds.${k}`)} />
          ))}
        </View>
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: amazen.space(2), paddingBottom: amazen.space(3), gap: amazen.space(2) }}>
          <View>
            {members.map((m, i) => (
              <WellRow
                key={approvalKey(m)}
                first={i === 0}
                last={i === members.length - 1}
                title={t(`approvals.kinds.${m.kind}`)}
                detail={describeApproval(m, tt, i18n.language, undefined, (n) => minutesText(n, tt)).headline}
                onPress={() =>
                  router.push({ pathname: '/(app)/approval/[key]', params: { key: approvalKey(m) } } as never)
                }
              />
            ))}
          </View>
          {day.kinds.some(kindNeedsMinutes) ? (
            <AText variant="caption" tone="muted">
              {t('approvals.day.needsMinutes')}
            </AText>
          ) : null}
          {day.approvable.length ? (
            <PrimaryButton
              label={t('approvals.day.approve')}
              onPress={() => void approve()}
              loading={busy}
              disabled={busy}
            />
          ) : (
            <AText variant="caption" tone="muted">
              {t('approvals.day.nothingToApprove')}
            </AText>
          )}
        </View>
      ) : null}
    </View>
  );
}
