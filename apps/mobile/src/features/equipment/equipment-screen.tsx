import React from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { custodyDays } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useAuth } from '../../contexts/auth-context';
import { useToast } from '../../island/island-context';
import { useResponsive } from '../../lib/responsive';
import { logColor, logTypeLabel } from '../../lib/log-display';
import { formatDay } from '../../lib/money';
import { forgetHeldAssets } from '../../hooks/use-held-assets';
import { useSyncStatus } from '../../offline/offline-context';
import { STILL_MINE } from '../../offline/actions/outcome';
import { AText, Ground, HeaderBack, PrimaryButton, ScreenHeader, Pill, SectionLabel, SheetOption } from '../../components/amazen';
import { centeredContent } from '../../components/screen-container';
import { JobSheet } from '../job/job-ui';
import { typesFor, logFor } from './use-equipment-screen';
import { SentRow } from './equipment-screen-helpers';
import { FactRow } from '../../components/amazen/fact-row';
import { useEquipmentScreenLogic } from './use-equipment-screen-logic';
import { EquipmentScreenStale } from './equipment-screen-stale';

/**
 * MY EQUIPMENT — what is due, what you hold, and what you sent in.
 *
 * Each card opens the thing itself (make, model, money in and out, what is
 * due, your last entries) — there was no page for one piece of equipment.
 * One button per card, the one that fits its kind: "Log something" for a kind
 * with a logbook, "Add a receipt" for one that only records money.
 */
export function EquipmentScreen() {
  const vm = useEquipmentScreenLogic();
  const {
    amazen,
    c,
    t,
    wide,
    money,
    day,
    data,
    refreshing,
    opened,
    setOpened,
    picking,
    setPicking,
    takingBack,
    setTakingBack,
    busy,
    load,
    items,
    whatOf,
    stateWords,
    dueLine,
    act,
    actLabel,
    takeBack,
    fromSheet,
    back,
    due,
  } = vm;

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader title={t('myAssets.title', 'My equipment')} leading={<HeaderBack onPress={back} />} style={wide ?? undefined} />
      {/*
        ⚠️ VIRTUALISED. "Sent in" is everything a member ever logged or claimed
        — it only grows — and it was drawn in full on open, inside one
        ScrollView. It is the list now; what is due and what you hold (a few
        things) ride above it as the header. Each row draws its own slice of
        the well, as on Jobs.
      */}
      <FlatList
        data={items}
        keyExtractor={(i) => i.key}
        initialNumToRender={12}
        windowSize={9}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(12) }, wide]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={c.accent}
            colors={[c.accent]}
          />
        }
        ListHeaderComponent={
          <EquipmentScreenStale vm={vm} />
        }
        renderItem={({ item, index }) => (
          <SentRow
            item={item}
            first={index === 0}
            last={index === items.length - 1}
            what={whatOf(item)}
            stateText={stateWords(item)}
            dayText={day(item.at)}
            amountText={item.amountCents ? money(item.amountCents) : null}
            onTakeBack={setTakingBack}
            takeBackLabel={t('logbook.withdraw', 'Take back')}
          />
        )}
      />

      {/* ---------- one piece of equipment ---------- */}
      <JobSheet
        visible={!!opened}
        onClose={() => setOpened(null)}
        title={opened?.asset?.name}
        eyebrow={opened?.asset?.category?.name ? <SectionLabel>{opened.asset.category.name}</SectionLabel> : undefined}>
        {opened ? (() => {
          const a = opened.asset;
          const facts: [string, string][] = [];
          const mm = [a?.manufacturer, a?.model].filter(Boolean).join(' · ');
          if (mm) facts.push([t('equipment.makeModel', 'Make · model'), mm]);
          if (a?.serialNumber) facts.push([t('equipment.serial', 'Serial'), a.serialNumber]);
          facts.push([
            t('equipment.withYouSince', 'With you since'),
            `${day(opened.startedAt)} · ${t('custody.days', { count: custodyDays(opened as never) })}`,
          ]);
          const mineDue = due.filter((d) => d.assetId === opened.assetId);
          const mineItems = items.filter((i) => i.assetId === opened.assetId).slice(0, 4);
          const label = actLabel(opened);
          return (
            <>
              <View style={{ backgroundColor: c.sunken, borderRadius: 18, paddingHorizontal: amazen.space(3.5) }}>
                {facts.map(([k, v], i) => <FactRow numeric key={k} first={i === 0} label={k} value={v} />)}
              </View>
              <View style={{ flexDirection: 'row', gap: amazen.space(2) }}>
                {[
                  [t('equipment.out', 'Out'), money(opened.totals.outCents), c.inkStrong],
                  [t('equipment.in', 'In'), money(opened.totals.inCents), opened.totals.inCents ? c.accent : c.inkStrong],
                  [t('equipment.entries', 'Entries'), String(opened.totals.entries), c.inkStrong],
                ].map(([k, v, col]) => (
                  <View key={k} style={{ flex: 1, backgroundColor: c.sunken, borderRadius: 14, padding: amazen.space(2.5) }}>
                    <SectionLabel>{k}</SectionLabel>
                    <AText numeric numberOfLines={1} style={{ fontSize: 14, marginTop: 2, color: col }}>{v}</AText>
                  </View>
                ))}
              </View>
              {mineDue.length ? (
                <>
                  <SectionLabel tone="warn">{t('equipment.due', 'Due')}</SectionLabel>
                  <View style={{ backgroundColor: c.sunken, borderRadius: 18, paddingHorizontal: amazen.space(3.5) }}>
                    {mineDue.map((d, i) => (
                      <FactRow numeric
                        key={d.key}
                        first={i === 0}
                        label={d.label}
                        value={dueLine(d)}
                        tone={d.stage === 'overdue' ? 'critical' : 'warn'}
                        onPress={() => fromSheet(() => logFor(d.assetId, d.key))}
                      />
                    ))}
                  </View>
                </>
              ) : null}
              {mineItems.length ? (
                <>
                  <SectionLabel>{t('equipment.lastEntries', 'Your last entries')}</SectionLabel>
                  <View style={{ backgroundColor: c.sunken, borderRadius: 18, paddingHorizontal: amazen.space(3.5) }}>
                    {mineItems.map((i, n) => (
                      <FactRow numeric
                        key={i.key}
                        first={n === 0}
                        label={`${whatOf(i)} · ${day(i.at)}`}
                        value={i.reading ?? (i.amountCents ? money(i.amountCents) : stateWords(i))}
                      />
                    ))}
                  </View>
                </>
              ) : null}
              {label ? <PrimaryButton label={label} onPress={() => { const h = opened; fromSheet(() => act(h)); }} /> : null}
            </>
          );
        })() : null}
      </JobSheet>

      {/* ---------- what did you do? ---------- */}
      <JobSheet
        visible={!!picking}
        onClose={() => setPicking(null)}
        title={t('logbook.whatDidYouDo', 'What did you do?')}
        eyebrow={picking?.asset?.name ? <SectionLabel>{picking.asset.name}</SectionLabel> : undefined}>
        {picking ? typesFor(picking).map((ty) => (
          <Pressable key={ty.key} onPress={() => { const h = picking; setPicking(null); setTimeout(() => logFor(h.assetId, ty.key), 280); }} accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: amazen.space(3),
              borderRadius: 16,
              paddingHorizontal: amazen.space(3.5),
              paddingVertical: amazen.space(3),
              backgroundColor: c.tile,
              opacity: pressed ? 0.8 : 1,
            })}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: logColor(ty.color) }} />
            <AText variant="body" tone="strong" style={{ flex: 1, fontSize: 14.5 }}>{logTypeLabel(ty, t)}</AText>
            {due.some((d) => d.assetId === picking.assetId && d.key === ty.key) ? (
              <Pill label={t('equipment.due', 'Due')} tone="warn" />
            ) : null}
            <AText variant="body" tone="muted">›</AText>
          </Pressable>
        )) : null}
      </JobSheet>

      {/* ---------- take it back? ---------- */}
      <JobSheet
        visible={!!takingBack}
        onClose={() => setTakingBack(null)}
        busy={busy}
        title={t('equipment.takeBackTitle', 'Take it back?')}>
        {takingBack ? (
          <>
            <AText variant="body" tone="ink" style={{ fontSize: 14, lineHeight: 21 }}>
              {[whatOf(takingBack), takingBack.about, takingBack.amountCents ? money(takingBack.amountCents) : null]
                .filter(Boolean)
                .join(' · ')}
              {'. '}{t('equipment.takeBackBody', 'Nobody will review it.')}
            </AText>
            <PrimaryButton label={t('equipment.keepIt', 'Keep it')} onPress={() => setTakingBack(null)} />
            <SheetOption label={t('logbook.withdraw', 'Take back')} tone="critical" disabled={busy} onPress={() => void takeBack()} />
          </>
        ) : null}
      </JobSheet>
    </Ground>
  );
}
