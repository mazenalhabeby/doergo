import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  APPROVAL_KIND_SPECS,
  approvalActionsFor,
  describeApproval,
  type ApprovalActionSpec,
  type ApprovalItem,
  type ApprovalT,
} from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../island/island-context';
import { approvalsApi } from '../../lib/api';
import { formatDay } from '../../lib/money';
import { useResponsive } from '../../lib/responsive';
import { AText, GhostButton, GlassInput, Ground, HeaderBack, PrimaryButton, ScreenHeader } from '../amazen';
import { centeredContent } from '../screen-container';
import { JobSheet, Pill, SectionLabel } from '../job/job-ui';
import { forgetApproval, knownApproval, loadApprovals } from './approvals-store';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ONE WAITING DECISION — its facts, and the kind's own buttons
 * (`approvalActionsFor`). An action that needs words or a number asks in a
 * sheet first. A kind whose decision needs a form the phone does not carry
 * (choosing an asset kind, a workspace) says so and offers nothing it cannot do.
 */
export function ApprovalDetail({ itemKey }: { itemKey: string }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(720) : null;

  const [item, setItem] = useState<ApprovalItem | null>(knownApproval(itemKey));
  const [missing, setMissing] = useState(false);
  const [armed, setArmed] = useState<ApprovalActionSpec | null>(null);
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState('30');
  const [expiresOn, setExpiresOn] = useState('');
  const [busy, setBusy] = useState(false);

  // Opened from a link, or after the list moved on: read it again.
  useEffect(() => {
    if (item) return;
    loadApprovals()
      .then(() => { const hit = knownApproval(itemKey); if (hit) setItem(hit); else setMissing(true); })
      .catch(() => setMissing(true));
  }, [item, itemKey]);

  useEffect(() => {
    if (!item) return;
    const d = item.data as Record<string, unknown>;
    setMinutes(String(typeof d.requestedMinutes === 'number' ? d.requestedMinutes : 30));
    setExpiresOn(typeof d.expiresOn === 'string' ? d.expiresOn.slice(0, 10) : '');
  }, [item]);

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/(app)/approvals' as Href));

  const decide = useCallback(async (a: ApprovalActionSpec) => {
    if (!item) return;
    setBusy(true);
    try {
      await approvalsApi.decide({
        kind: item.kind,
        id: item.id,
        action: a.id,
        reason: a.reason !== 'none' && reason.trim() ? reason.trim() : undefined,
        minutes: a.input === 'minutes' ? Number(minutes) : undefined,
        expiresOn: a.input === 'expiresOn' && expiresOn ? expiresOn : undefined,
        spaceId: item.kind === 'clientRequest' ? (item.space?.id ?? (item.data.suggestedSpaceId as string | undefined)) : undefined,
      });
      forgetApproval(itemKey);
      toast.success(t('approvals.decided', { name: item.subject.name || t('approvals.someone') }));
      setArmed(null);
      back();
    } catch (e: any) {
      toast.error(e?.message || t('approvals.loadFailed'));
    } finally {
      setBusy(false);
    }
  }, [item, itemKey, reason, minutes, expiresOn, toast, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const press = (a: ApprovalActionSpec) => {
    if (a.reason !== 'none' || a.input) {
      setReason('');
      setArmed(a);
    } else void decide(a);
  };

  if (missing || !item) {
    return (
      <Ground style={{ flex: 1 }}>
        <ScreenHeader title={t('approvals.title')} leading={<HeaderBack onPress={back} />} />
        {missing
          ? <AText variant="body" tone="onGlass" style={{ textAlign: 'center', padding: amazen.space(8) }}>{t('approvals.gone')}</AText>
          : <ActivityIndicator style={{ marginTop: amazen.space(10) }} color={c.accent} />}
      </Ground>
    );
  }

  const text = describeApproval(item, t as unknown as ApprovalT, i18n.language);
  const actions = approvalActionsFor(item);
  const pageOnly = item.canDecide && actions.length === 0 && !!APPROVAL_KIND_SPECS[item.kind].needsPage?.(item);
  const facts: [string, string, string | undefined][] = [
    ...(item.space ? [[t('approvals.fact.workspace'), item.space.name, undefined]] as [string, string, undefined][] : []),
    ...text.facts.map((f) => [f.label, f.value, f.tone] as [string, string, string | undefined]),
    ...(item.raisedAt ? [[t('approvals.fact.raised'), formatDay(item.raisedAt, i18n.language), undefined]] as [string, string, undefined][] : []),
  ];

  const minutesOk = Number.isInteger(Number(minutes)) && Number(minutes) >= 1 && Number(minutes) <= 1440;
  const ready = armed
    && !(armed.reason === 'required' && !reason.trim())
    && !(armed.input === 'minutes' && !minutesOk)
    && !(armed.input === 'expiresOn' && expiresOn !== '' && !ISO_DAY.test(expiresOn));

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader title={t(`approvals.kinds.${item.kind}`)} leading={<HeaderBack onPress={back} />} style={wide ?? undefined} />
      <ScrollView contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(30), gap: amazen.space(3) }, wide]}>
        <View style={{ gap: amazen.space(1.5), alignItems: 'flex-start' }}>
          <AText variant="h2" tone="strong">{item.subject.name || t('approvals.someone')}</AText>
          <AText variant="body" tone="onGlass">{text.headline}</AText>
          {item.group === 'NOW' ? <Pill label={t('approvals.groups.NOW')} tone="critical" /> : null}
        </View>
        <View style={{ backgroundColor: c.well, borderRadius: amazen.radius.panel, paddingHorizontal: amazen.space(3.5), paddingVertical: amazen.space(1.5) }}>
          {facts.map(([k, v, tone], i) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: amazen.space(3), paddingVertical: amazen.space(2.25), borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.lineWell }}>
              <AText variant="caption" style={{ color: c.inkMuted, fontSize: 13 }}>{k}</AText>
              <AText
                variant="body"
                tone={tone === 'bad' ? 'critical' : tone === 'warn' ? 'warn' : 'strong'}
                numberOfLines={3}
                style={{ fontSize: 13.5, flexShrink: 1, textAlign: 'right' }}
              >
                {v}
              </AText>
            </View>
          ))}
        </View>
        {pageOnly ? <AText variant="caption" tone="onGlass">{t(`approvals.needsPage.${item.kind}`)}</AText> : null}
        {!item.canDecide ? <AText variant="caption" tone="onGlass">{t('approvals.readOnly')}</AText> : null}
      </ScrollView>

      {actions.length ? (
        <View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: amazen.space(2), paddingHorizontal: amazen.space(4), paddingTop: amazen.space(3), paddingBottom: amazen.space(8), backgroundColor: c.canvas }, wide]}>
          {actions.slice().reverse().map((a) => (
            <View key={a.id} style={{ flex: 1 }}>
              {a.tone === 'danger'
                ? <GhostButton label={t(`approvals.actions.${a.labelKey}`)} tone="critical" disabled={busy} onPress={() => press(a)} />
                : <PrimaryButton label={t(`approvals.actions.${a.labelKey}`)} loading={busy && !armed} disabled={busy} onPress={() => press(a)} />}
            </View>
          ))}
        </View>
      ) : null}

      <JobSheet
        visible={!!armed}
        onClose={() => setArmed(null)}
        busy={busy}
        title={armed ? t(`approvals.actions.${armed.labelKey}`) : ''}
        eyebrow={<SectionLabel>{item.subject.name}</SectionLabel>}
      >
        {armed?.input === 'minutes' ? (
          <>
            <SectionLabel>{t('approvals.minutes')}</SectionLabel>
            <GlassInput value={minutes} onChangeText={setMinutes} keyboardType="number-pad" maxLength={4} />
          </>
        ) : null}
        {armed?.input === 'expiresOn' ? (
          <>
            <SectionLabel>{t('approvals.expiresOn')}</SectionLabel>
            <GlassInput value={expiresOn} onChangeText={setExpiresOn} placeholder="2027-12-31" keyboardType="numbers-and-punctuation" maxLength={10} />
          </>
        ) : null}
        {armed && armed.reason !== 'none' ? (
          <>
            <SectionLabel>{t(armed.reason === 'required' ? 'approvals.reasonRequired' : 'approvals.reasonOptional')}</SectionLabel>
            <GlassInput value={reason} onChangeText={setReason} multiline maxLength={500} autoFocus />
          </>
        ) : null}
        <PrimaryButton
          label={armed ? t(`approvals.actions.${armed.labelKey}`) : ''}
          loading={busy}
          disabled={busy || !ready}
          onPress={() => armed && void decide(armed)}
        />
      </JobSheet>
    </Ground>
  );
}
