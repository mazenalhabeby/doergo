import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { normalizeKindShape, logTypesForKind, kindHolderLabel, COST_LOG_KEY, formatMoney, personName } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useAuth } from '../../contexts/auth-context';
import { useToast } from '../../island/island-context';
import { assetRegisterApi, locationsApi, type LocationAssignment, type RegisterAsset, type RegisterLogEntry } from '../../lib/api';
import { holdsIn } from '../../lib/permissions';
import { formatDay } from '../../lib/money';
import { logColor, logTypeLabel } from '../../lib/log-display';
import { useResponsive } from '../../lib/responsive';
import { AText, GhostButton, Ground, HeaderBack, PrimaryButton, ScreenHeader } from '../amazen';
import { centeredContent } from '../screen-container';
import { JobSheet, Pill, SectionLabel, SheetOption } from '../job/job-ui';
import { StatusDot, WellRow } from './well-row';
import { holderName, SETTABLE_STATUSES, statusLabel } from './register-words';

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
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(720) : null;
  const lang = i18n.language;

  const [asset, setAsset] = useState<RegisterAsset | null>(null);
  const [missing, setMissing] = useState(false);
  const [entries, setEntries] = useState<RegisterLogEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [sheet, setSheet] = useState<null | 'log' | 'status' | 'handover'>(null);
  const [busy, setBusy] = useState(false);
  const [roster, setRoster] = useState<LocationAssignment[] | null>(null);

  const reload = useCallback(async () => {
    try {
      const [a, log] = await Promise.all([assetRegisterApi.get(id), assetRegisterApi.log(id)]);
      setAsset(a);
      setEntries(log.entries);
      setCursor(log.nextCursor);
    } catch {
      setMissing(true);
    }
  }, [id]);

  /* Again on every return — an entry just filed from the logbook form shows at once. */
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const spaceId = asset?.category?.spaceId ?? null;
  const mayLog = holdsIn(user as never, 'canLogAssets', spaceId);
  const mayManage = holdsIn(user as never, 'canManageAssets', spaceId);
  const shape = useMemo(() => normalizeKindShape(asset?.category?.config), [asset]);
  const types = useMemo(() => logTypesForKind(shape).filter((ty) => ty.key !== COST_LOG_KEY), [shape]);
  /*
    Handing over follows the KIND: only a kind that is held, by members, and by
    one at a time. A kind held by clients, or by several people at once, is
    handed over on the web, where the picker shows the whole set — replacing it
    with one name from here would drop the others.
  */
  const handsOver = shape.holder.enabled && shape.holder.members && !shape.holder.multiple;

  /* The people of this workspace — whom it can be handed to. Read only when the sheet opens. */
  useEffect(() => {
    if (sheet !== 'handover' || roster || !spaceId) return;
    locationsApi.getAssignedMembers(spaceId).then(setRoster).catch(() => setRoster([]));
  }, [sheet, roster, spaceId]);

  const more = useCallback(async () => {
    if (!cursor || moreBusy) return;
    setMoreBusy(true);
    try {
      const page = await assetRegisterApi.log(id, cursor);
      setEntries((prev) => [...prev, ...page.entries]);
      setCursor(page.nextCursor);
    } catch { /* the button stays; try again */ } finally { setMoreBusy(false); }
  }, [cursor, moreBusy, id]);

  const act = useCallback(async (what: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await what();
      toast.success(done);
      setSheet(null);
      await reload();
    } catch (e: any) {
      toast.error(e?.message || t('register.failed', 'That did not work — try again.'));
    } finally {
      setBusy(false);
    }
  }, [reload, toast, t]);

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/(app)/equipment' as Href));

  if (missing) {
    return (
      <Ground style={{ flex: 1 }}>
        <ScreenHeader title={t('register.title', 'Equipment')} leading={<HeaderBack onPress={back} />} />
        <View style={{ padding: amazen.space(8), alignItems: 'center' }}>
          <AText variant="body" tone="onGlass" style={{ textAlign: 'center' }}>{t('register.notFound', 'This one is not in your workspaces.')}</AText>
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

  const who = holderName(asset.holders);
  const facts: [string, string][] = [
    [t('register.facts.status', 'Status'), statusLabel(t, asset.status)],
    ...(shape.holder.enabled ? [[kindHolderLabel(shape, t('register.facts.holder', 'Who has it')), who ?? t('register.notHanded', 'Not handed out')]] as [string, string][] : []),
    ...(asset.serialNumber ? [[t('register.facts.serial', 'Serial'), asset.serialNumber]] as [string, string][] : []),
    ...([asset.manufacturer, asset.model].filter(Boolean).length ? [[t('register.facts.makeModel', 'Make · model'), [asset.manufacturer, asset.model].filter(Boolean).join(' · ')]] as [string, string][] : []),
    ...(asset.locationAddress ? [[t('register.facts.where', 'Where'), asset.locationAddress]] as [string, string][] : []),
  ];

  const entryValue = (e: RegisterLogEntry) => (e.amountCents ? formatMoney(e.amountCents, 'EUR', lang) : null);
  const entryState = (e: RegisterLogEntry) =>
    e.status === 'SUBMITTED' ? <Pill label={t('equipment.state.office', 'Waiting for the office')} tone="warn" />
      : e.status === 'REJECTED' ? <Pill label={t('equipment.state.refused', 'Refused')} tone="critical" />
        : null;

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader title={asset.category?.name ?? t('register.title', 'Equipment')} leading={<HeaderBack onPress={back} />} style={wide ?? undefined} />
      <ScrollView contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(30), gap: amazen.space(3) }, wide]}>
        <View style={{ gap: amazen.space(1.5) }}>
          <AText variant="h2" tone="strong">{asset.name}</AText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
            <StatusDot status={asset.status} />
            <AText variant="caption" tone="onGlass">{statusLabel(t, asset.status)}</AText>
          </View>
        </View>

        <View style={{ backgroundColor: c.well, borderRadius: amazen.radius.panel, paddingHorizontal: amazen.space(3.5), paddingVertical: amazen.space(1.5) }}>
          {facts.map(([k, v], i) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: amazen.space(3), paddingVertical: amazen.space(2.25), borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.lineWell }}>
              <AText variant="caption" style={{ color: c.inkMuted, fontSize: 13 }}>{k}</AText>
              <AText variant="body" tone="strong" numberOfLines={2} style={{ fontSize: 13.5, flexShrink: 1, textAlign: 'right' }}>{v}</AText>
            </View>
          ))}
        </View>

        <SectionLabel>{t('register.logbook', 'Logbook')}</SectionLabel>
        {entries.length === 0 ? (
          <AText variant="body" tone="onGlass">{t('register.logEmpty', 'Nothing logged yet.')}</AText>
        ) : (
          <View>
            {entries.map((e, i) => (
              <WellRow
                key={e.id}
                first={i === 0}
                last={i === entries.length - 1}
                leading={<View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c.accent }} />}
                title={e.category}
                detail={[e.author ? personName(e.author) : null, formatDay(e.occurredAt, lang), e.note].filter(Boolean).join(' · ')}
                trailing={entryState(e) ?? (entryValue(e) ? <AText numeric variant="caption" tone="strong">{entryValue(e)}</AText> : <View />)}
                onPress={() => undefined}
              />
            ))}
          </View>
        )}
        {cursor ? <GhostButton label={moreBusy ? '…' : t('register.olderEntries', 'Older entries')} onPress={() => void more()} /> : null}
      </ScrollView>

      {/* What this member may do here — absent rather than disabled. */}
      <View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: amazen.space(4), paddingTop: amazen.space(3), paddingBottom: amazen.space(8), gap: amazen.space(2), backgroundColor: c.canvas }, wide]}>
        {mayManage ? (
          <View style={{ flexDirection: 'row', gap: amazen.space(2) }}>
            <GhostButton label={t('register.changeStatus', 'Change status')} onPress={() => setSheet('status')} style={{ flex: 1 }} />
            {handsOver ? <GhostButton label={t('register.handOver', 'Hand over')} onPress={() => setSheet('handover')} style={{ flex: 1 }} /> : null}
          </View>
        ) : null}
        {mayLog && types.length > 0 ? (
          <PrimaryButton label={t('register.addToLog', 'Add to logbook')} onPress={() => setSheet('log')} />
        ) : !mayLog && !mayManage ? (
          <AText variant="caption" tone="onGlass" style={{ textAlign: 'center' }}>{t('register.readOnly', 'You can read this. Adding to the logbook needs Log in this workspace.')}</AText>
        ) : null}
      </View>

      <JobSheet visible={sheet === 'log'} onClose={() => setSheet(null)} title={t('logbook.whatDidYouDo', 'What did you do?')} eyebrow={<SectionLabel>{asset.name}</SectionLabel>}>
        {types.map((ty) => (
          <Pressable
            key={ty.key}
            accessibilityRole="button"
            onPress={() => { setSheet(null); setTimeout(() => router.push({ pathname: '/(app)/asset-log', params: { assetId: asset.id, logType: ty.key, from: 'register' } } as never), 280); }}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), borderRadius: 16, paddingHorizontal: amazen.space(3.5), paddingVertical: amazen.space(3), backgroundColor: c.tile, opacity: pressed ? 0.8 : 1 })}
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

      <JobSheet visible={sheet === 'handover'} onClose={() => setSheet(null)} busy={busy} title={t('register.handOverTitle', 'Who gets it?')}>
        {!spaceId ? (
          <AText variant="body" tone="ink">{t('register.handOverWeb', 'This kind belongs to no workspace — hand it over on the web.')}</AText>
        ) : roster === null ? (
          <ActivityIndicator color={c.accent} />
        ) : (
          <>
            {roster.filter((m) => m.user).map((m) => (
              <SheetOption
                key={m.userId}
                label={personName(m.user)}
                disabled={busy || (asset.holders ?? []).some((h) => h.userId === m.userId)}
                onPress={() => void act(() => assetRegisterApi.handOver(asset.id, { userId: m.userId }), t('register.handedOver', 'Handed over'))}
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
