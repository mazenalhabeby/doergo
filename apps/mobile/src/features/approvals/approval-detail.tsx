import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { NO_SHOW_EXCUSE_REASONS } from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import {
  AText,
  GhostButton,
  GlassInput,
  Ground,
  HeaderBack,
  PrimaryButton,
  ScreenHeader,
  Pill,
  SectionLabel,
} from '@/components/amazen';
import { JobSheet } from '../job/job-ui';
import { WhoElse } from './who-else';
import { useApprovalDetail } from './use-approval-detail';
import { ApprovalDetailView } from './approval-detail-view';
import { ApprovalDurationField } from './approval-duration-field';
import { AgreedTimeLine, ApprovalTags, StepNotice } from './approval-step-notice';
import { FactsWell } from '@/components/facts-well';
import { DateField } from '@/components/date-field';

/**
 * ONE WAITING DECISION — its facts, and the kind's own buttons
 * (`approvalActionsFor`). An action that needs words or a number asks in a
 * sheet first. A kind whose decision needs a form the phone does not carry
 * (choosing an asset kind, a workspace) says so and offers nothing it cannot do.
 */
export function ApprovalDetail({ itemKey }: { itemKey: string }) {
  const {
    amazen,
    c,
    t,
    i18n,
    wide,
    item,
    missing,
    armed,
    setArmed,
    reason,
    setReason,
    duration,
    setDuration,
    expiresOn,
    setExpiresOn,
    reasonCode,
    setReasonCode,
    wholeRun,
    setWholeRun,
    busy,
    back,
    decide,
    runCount,
    press,
    webUrl,
    openWeb,
  } = useApprovalDetail({ itemKey });
  // The earliest day an expiry may take: today — or an earlier day the item already carries, so it stays valid.
  const minExpiry = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const pre =
      typeof item?.data.expiresOn === 'string' ? new Date(`${item.data.expiresOn.slice(0, 10)}T00:00:00`) : null;
    return pre && !Number.isNaN(pre.getTime()) && pre < today ? pre : today;
  }, [item]);

  if (missing || !item) {
    return (
      <Ground style={{ flex: 1 }}>
        <ScreenHeader title={t('approvals.title')} leading={<HeaderBack onPress={back} />} />
        {missing ? (
          <View style={{ padding: amazen.space(8), gap: amazen.space(4) }}>
            <AText variant="body" tone="onGlass" style={{ textAlign: 'center' }}>
              {t('approvals.gone')}
            </AText>
            <PrimaryButton label={t('approvals.back')} onPress={back} />
          </View>
        ) : (
          <ActivityIndicator style={{ marginTop: amazen.space(10) }} color={c.accent} />
        )}
      </Ground>
    );
  }

  const { text, actions, pageOnly, facts, ready } = ApprovalDetailView({
    t,
    i18n,
    item,
    armed,
    reason,
    duration,
    expiresOn,
  });

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader
        title={t(`approvals.kinds.${item.kind}`)}
        leading={<HeaderBack onPress={back} />}
        style={wide ?? undefined}
      />
      <ScrollView
        contentContainerStyle={[
          { paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(30), gap: amazen.space(3) },
          wide,
        ]}
      >
        <View style={{ gap: amazen.space(1.5), alignItems: 'flex-start' }}>
          <AText variant="h2" tone="strong">
            {item.subject.name || t('approvals.someone')}
          </AText>
          <AText variant="body" tone="onGlass">
            {text.headline}
          </AText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(1.5) }}>
            {item.group === 'NOW' ? <Pill label={t('approvals.groups.NOW')} tone="critical" /> : null}
            <ApprovalTags item={item} />
          </View>
        </View>
        <FactsWell amazen={amazen} facts={facts} lines={3} />
        {item.step ? <StepNotice step={item.step} /> : null}
        <WhoElse item={item} />
        {pageOnly ? (
          <View style={{ gap: amazen.space(2) }}>
            <AText variant="caption" tone="onGlass">
              {t(`approvals.needsPage.${item.kind}`)}
            </AText>
            {webUrl ? <GhostButton label={t('approvals.openPage')} onPress={openWeb} /> : null}
          </View>
        ) : null}
        {!item.canDecide ? (
          <AText variant="caption" tone="onGlass">
            {t('approvals.readOnly')}
          </AText>
        ) : null}
      </ScrollView>

      {actions.length ? (
        <View
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              flexDirection: 'row',
              gap: amazen.space(2),
              paddingHorizontal: amazen.space(4),
              paddingTop: amazen.space(3),
              paddingBottom: amazen.space(8),
              backgroundColor: c.canvas,
            },
            wide,
          ]}
        >
          {actions
            .slice()
            .reverse()
            .map((a) => (
              <View key={a.id} style={{ flex: 1 }}>
                {a.tone !== 'primary' ? (
                  <GhostButton
                    label={t(`approvals.actions.${a.labelKey}`)}
                    tone={a.tone === 'danger' ? 'critical' : undefined}
                    disabled={busy}
                    onPress={() => press(a)}
                  />
                ) : (
                  <PrimaryButton
                    label={t(`approvals.actions.${a.labelKey}`)}
                    loading={busy && !armed}
                    disabled={busy}
                    onPress={() => press(a)}
                  />
                )}
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
            <AgreedTimeLine item={item} />
            <ApprovalDurationField key={`${itemKey}:${armed.id}`} value={duration} onChange={setDuration} />
          </>
        ) : null}
        {armed?.input === 'expiresOn' ? (
          <>
            <SectionLabel>{t('approvals.expiresOn')}</SectionLabel>
            <DateField
              value={expiresOn}
              onChange={setExpiresOn}
              minDate={minExpiry}
              clearable
              title={t('approvals.expiresOn')}
            />
          </>
        ) : null}
        {armed?.input === 'excuseReason' ? (
          <>
            <SectionLabel>{t('approvals.noShow.whatHappened')}</SectionLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(2) }}>
              {NO_SHOW_EXCUSE_REASONS.map((code) => {
                const on = reasonCode === code;
                return (
                  <Pressable
                    key={code}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    onPress={() => setReasonCode(code)}
                    style={{
                      paddingHorizontal: amazen.space(3.5),
                      paddingVertical: amazen.space(2),
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: on ? c.accent : c.lineWell,
                      backgroundColor: on ? c.accentTint : 'transparent',
                    }}
                  >
                    <AText variant="body" tone="strong" style={{ fontSize: 14, color: on ? c.accent : undefined }}>
                      {t(`approvals.noShow.reasons.${code}`)}
                    </AText>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}
        {armed && item.kind === 'noShow' ? (
          <AText variant="caption" tone="onGlass">
            {t(armed.id === 'approve' ? 'approvals.noShow.excusedHelp' : 'approvals.noShow.absentHelp')}
          </AText>
        ) : null}
        {armed && runCount > 1 ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: amazen.space(3),
            }}
          >
            <AText variant="body" tone="strong" style={{ flexShrink: 1 }}>
              {t('approvals.noShow.wholeRun', { count: runCount })}
            </AText>
            <Switch value={wholeRun} onValueChange={setWholeRun} />
          </View>
        ) : null}
        {armed && armed.reason !== 'none' ? (
          <>
            <SectionLabel>
              {t(armed.reason === 'required' ? 'approvals.reasonRequired' : 'approvals.reasonOptional')}
            </SectionLabel>
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
