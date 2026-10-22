import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  normalizeKindShape,
  logTypesForKind,
  findLogType,
  kindHolderLabel,
  logValueLines,
  COST_LOG_KEY,
  formatMoney,
  personName,
} from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/island/island-context';
import { assetRegisterApi, locationsApi, type LocationAssignment, type RegisterAsset, type RegisterLogEntry } from '@/lib/api';
import { holdsIn } from '@/lib/permissions';
import { formatDay } from '@/lib/money';
import { logColor, logTypeLabel } from '@/lib/log-display';
import { useResponsive } from '@/lib/responsive';
import {
  AText,
  GhostButton,
  Ground,
  HeaderBack,
  PrimaryButton,
  ScreenHeader,
  Pill,
  SectionLabel,
  SheetOption,
} from '@/components/amazen';
import { centeredContent } from '@/components/screen-container';
import { JobSheet } from '../job/job-ui';
import { StatusDot, WellRow } from './well-row';
import { holderName, SETTABLE_STATUSES, statusLabel } from './register-words';
import { useRegisterRecord } from './use-register-record';
import { RegisterRecordView } from './register-record-view';
import { RegisterRecordLogbook } from './register-record-logbook';

/**
 * ONE PIECE OF EQUIPMENT — its facts, its logbook, and what this member may do.
 *
 * The buttons follow the level held in THE RECORD'S workspace (its kind's
 * space), the question the server asks:
 *   view   → read only
 *   log    → "Add to logbook" (the kind's own entry types; Cost is the staff's
 *            receipt flow, custody-bound, so it is not offered here)
 *   manage → also change the status and hand it over to somebody in the workspace
 * Creating and deleting records stay on the web.
 */
export function RegisterRecord({ id }: { id: string }) {
  const vm = useRegisterRecord({ id });
  const {
    amazen,
    c,
    t,
    user,
    wide,
    lang,
    asset,
    missing,
    entries,
    cursor,
    moreBusy,
    sheet,
    setSheet,
    busy,
    roster,
    spaceId,
    mayLog,
    mayManage,
    shape,
    types,
    handsOver,
    more,
    act,
    back,
  } = vm;

  if (missing) {
    return (
      <Ground style={{ flex: 1 }}>
        <ScreenHeader title={t('register.title', 'Equipment')} leading={<HeaderBack onPress={back} />} />
        <View style={{ padding: amazen.space(8), alignItems: 'center' }}>
          <AText variant="body" tone="onGlass" style={{ textAlign: 'center' }}>
            {t('register.notFound', 'This one is not in your workspaces.')}
          </AText>
        </View>
      </Ground>
    );
  }
  if (!asset) {
    return (
      <Ground style={{ flex: 1 }}>
        <ScreenHeader title={t('register.title', 'Equipment')} leading={<HeaderBack onPress={back} />} />
        <ActivityIndicator style={{ marginTop: amazen.space(10) }} color={c.accent} />
      </Ground>
    );
  }

  const { who, facts, entryValue, entryState } = RegisterRecordView({ t, lang, asset, shape });

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader
        title={asset.category?.name ?? t('register.title', 'Equipment')}
        leading={<HeaderBack onPress={back} />}
        style={wide ?? undefined}
      />
      <RegisterRecordLogbook vm={vm} facts={facts} entryState={entryState} entryValue={entryValue} />

      {/* What this member may do here — absent rather than disabled. */}
      <View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: amazen.space(4),
            paddingTop: amazen.space(3),
            paddingBottom: amazen.space(8),
            gap: amazen.space(2),
            backgroundColor: c.canvas,
          },
          wide,
        ]}>
        {mayManage ? (
          <View style={{ flexDirection: 'row', gap: amazen.space(2) }}>
            <GhostButton label={t('register.changeStatus', 'Change status')} onPress={() => setSheet('status')} style={{ flex: 1 }} />
            {handsOver ? (
              <GhostButton
                label={t('register.handOver', 'Hand over')}
                onPress={() => setSheet('handover')}
                style={{ flex: 1 }}
              />
            ) : null}
          </View>
        ) : null}
        {mayLog && types.length > 0 ? (
          <PrimaryButton label={t('register.addToLog', 'Add to logbook')} onPress={() => setSheet('log')} />
        ) : !mayLog && !mayManage ? (
          <AText variant="caption" tone="onGlass" style={{ textAlign: 'center' }}>
            {t('register.readOnly', 'You can read this. Adding to the logbook needs Log in this workspace.')}
          </AText>
        ) : null}
      </View>

      <JobSheet
        visible={sheet === 'log'}
        onClose={() => setSheet(null)}
        title={t('logbook.whatDidYouDo', 'What did you do?')}
        eyebrow={<SectionLabel>{asset.name}</SectionLabel>}>
        {types.map((ty) => (
          <Pressable
            key={ty.key}
            accessibilityRole="button"
            onPress={() => {
              setSheet(null);
              setTimeout(
                () =>
                  router.push({
                    pathname: '/(app)/asset-log',
                    params: { assetId: asset.id, logType: ty.key, from: 'register' },
                  } as never),
                280,
              );
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: amazen.space(3),
              borderRadius: 16,
              paddingHorizontal: amazen.space(3.5),
              paddingVertical: amazen.space(3),
              backgroundColor: c.tile,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: logColor(ty.color) }} />
            <AText variant="body" tone="strong" style={{ flex: 1, fontSize: 14.5 }}>{logTypeLabel(ty, t as never)}</AText>
            <AText variant="body" tone="muted">›</AText>
          </Pressable>
        ))}
      </JobSheet>

      <JobSheet visible={sheet === 'status'} onClose={() => setSheet(null)} busy={busy} title={t('register.changeStatus', 'Change status')}>
        {SETTABLE_STATUSES.map((s) => (
          <SheetOption
            key={s}
            label={statusLabel(t, s)}
            tone={s === asset.status ? 'accent' : 'strong'}
            disabled={busy || s === asset.status}
            onPress={() => void act(() => assetRegisterApi.setStatus(asset.id, s), t('register.statusSaved', 'Status saved'))}
          />
        ))}
        <AText variant="caption" tone="muted">{t('register.retireOnWeb', 'Retiring or deleting a record is done on the web.')}</AText>
      </JobSheet>

      <JobSheet
        visible={sheet === 'handover'}
        onClose={() => setSheet(null)}
        busy={busy}
        title={t('register.handOverTitle', 'Who gets it?')}>
        {!spaceId ? (
          <AText variant="body" tone="ink">
            {t('register.handOverWeb', 'This kind belongs to no workspace — hand it over on the web.')}
          </AText>
        ) : roster === null ? (
          <ActivityIndicator color={c.accent} />
        ) : (
          <>
            {/* External members hold no equipment — custody is the organization's own staff. */}
            {roster.filter((m) => m.user && (m.user as { isExternal?: boolean }).isExternal !== true).map((m) => (
              <SheetOption
                key={m.userId}
                label={personName(m.user)}
                disabled={busy || (asset.holders ?? []).some((h) => h.userId === m.userId)}
                onPress={() =>
                  void act(
                    () => assetRegisterApi.handOver(asset.id, { userId: m.userId }),
                    t('register.handedOver', 'Handed over'),
                  )
                }
              />
            ))}
            {who ? (
              <SheetOption
                label={t('register.takeBack', 'Nobody — take it back')}
                tone="critical"
                disabled={busy}
                onPress={() => void act(() => assetRegisterApi.handOver(asset.id, { userId: null }), t('register.takenBack', 'Taken back'))}
              />
            ) : null}
          </>
        )}
      </JobSheet>
    </Ground>
  );
}
