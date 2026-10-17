import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { DetentSheet } from '../../components/route/detent-sheet';
import { PressableScale } from '../../components/pressable-scale';
import { Ionicons } from '@expo/vector-icons';
import { type Task } from '../../lib/api';
import { COLORS, SPACING } from '../../lib/constants';
import { type RouteStop } from '@hbcfield/shared/client';
import { formatDistance } from '../../lib/distance';
import { fmtDur, LegRow, PickRow, styles } from './route-planner-screen-helpers';
import type { RoutePlannerScreenState } from './use-route-planner-screen';

/** Part of RoutePlannerScreen's markup, moved here unchanged; it reads the page's state from `vm`. */
export function RoutePlannerScreenYourRoute({ vm }: { vm: RoutePlannerScreenState }) {
  const {
    detent,
    setDetent,
    result,
    colors,
    t,
    setResult,
    toDrive,
    orderedStops,
    selectedCount,
    start,
    error,
    openFullRoute,
    resuming,
    optimize,
    optimizing,
    loading,
    tasks,
    aheadIds,
    selected,
    load,
    legTo,
    startNavigation,
    toggleStop,
  } = vm;
  return (
    <DetentSheet
      detent={detent}
      onDetentChange={setDetent}
      peekHeight={result ? 250 : 210}
      backgroundColor={colors.card}
      borderColor={colors.border}
      grabberColor={colors.border}
      header={
        <View style={styles.sheetHead}>
          <View style={styles.sheetTitleRow}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
              {result ? t('route.yourRoute', 'Your route') : t('route.title', 'Plan my route')}
            </Text>
            {!!result && (
              <TouchableOpacity onPress={() => setResult(null)} hitSlop={8}>
                <Text style={[styles.sheetReset, { color: COLORS.primary }]}>{t('route.edit', 'Edit')}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* One line that answers "is this my morning or a detour?" */}
          <Text style={[styles.sheetMeta, { color: colors.textMuted }]} numberOfLines={1}>
            {result
              ? (toDrive.length < orderedStops.length
                  ? t('route.remaining', {
                      defaultValue: '{{left}} of {{total}} stops left',
                      left: toDrive.length,
                      total: orderedStops.length,
                    })
                  : `${result.order.length} ${t('route.stopsWord', 'stops')} · ${formatDistance(result.totalMeters)} · ${fmtDur(result.totalSeconds)}`)
              : `${selectedCount} ${t('route.selected', 'selected')}${start ? ` · ${start.label}` : ''}`}
          </Text>

          {/*
            An estimate is not a drive time, and it must say so. Without a
            routing engine these numbers come from straight-line distance with
            a road factor, which is close enough to plan by and wrong enough
            that nobody should quote it to a client.
          */}
          {!!result && result.engine === 'nearest-neighbour' && (
            <Text style={[styles.sheetNote, { color: colors.textMuted }]}>
              {t('route.estimatedOnly', 'Order and estimates only — no road route available.')}
            </Text>
          )}

          {!!error && <Text style={styles.sheetError}>{error}</Text>}

          {result ? (
            <PressableScale onPress={openFullRoute} disabled={resuming} style={[styles.cta, { backgroundColor: COLORS.primary }]} accessibilityRole="button">
              {resuming
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="navigate" size={17} color="#fff" />}
              {/* "Continue" once some of the day is behind them — the button
                  is doing a different thing and should not claim otherwise. */}
              <Text style={styles.ctaText}>
                {toDrive.length < orderedStops.length
                  ? t('route.continueNav', 'Continue route')
                  : t('route.startNav', 'Start navigation')}
              </Text>
            </PressableScale>
          ) : (
            <PressableScale
              onPress={optimize}
              disabled={optimizing || selectedCount === 0}
              style={[styles.cta, { backgroundColor: selectedCount === 0 ? colors.border : COLORS.primary }]}
              accessibilityRole="button"
            >
              {optimizing
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="git-network" size={17} color="#fff" />}
              <Text style={[styles.ctaText, selectedCount === 0 && { color: colors.textMuted }]}>
                {t('route.optimize', 'Optimize route')}
              </Text>
            </PressableScale>
          )}
        </View>
      }
    >
      {/*
        ⚠️ VIRTUALISED. A dispatcher's day can hold a lot of located tasks to
        pick from; the sheet drew every one on open. The sheet's drag lives on
        its header only (detent-sheet.tsx), so the body is free to be a list.
      */}
      <FlatList<Task | RouteStop>
        data={loading ? [] : result ? orderedStops : tasks}
        keyExtractor={(x) => x.id}
        extraData={result ? aheadIds : selected}
        initialNumToRender={12}
        windowSize={9}
        contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={COLORS.primary} />}
        ListEmptyComponent={loading ? (
          <ActivityIndicator style={{ marginVertical: SPACING.xl }} color={COLORS.primary} />
        ) : (
          <View style={styles.empty}>
            <Ionicons name="map-outline" size={40} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {t('route.noStops', 'No tasks with a location. Add a location to a task to route to it.')}
            </Text>
          </View>
        )}
        renderItem={({ item, index }) => {
          if (result) {
            const s = item as RouteStop;
            const leg = legTo(index);
            return (
              <LegRow
                stop={s}
                index={index}
                last={index === orderedStops.length - 1}
                done={!aheadIds.has(s.id)}
                drive={leg ? `${formatDistance(leg.meters)} · ${fmtDur(leg.seconds)}` : null}
                onNav={startNavigation}
              />
            );
          }
          const x = item as Task;
          return <PickRow id={x.id} title={x.title} address={x.locationAddress ?? null} on={!!selected[x.id]} onToggle={toggleStop} />;
        }}
        /*
          No app picker here any more. It was a preference chosen before
          anyone knew what the phone had, so it could point at an app that
          was not installed — and the link that produced failed silently.
          The choice is offered at the moment of navigating, and only when
          there is genuinely something to choose between.
        */
        ListFooterComponent={!!result && orderedStops.length > 1 ? (
          <Text style={[styles.navNote, { color: colors.textMuted }]}>
            {t('route.multiStopNote', 'Start navigation opens the whole route. Use the arrow beside a stop to drive to just that one.')}
          </Text>
        ) : null}
      />
    </DetentSheet>
  );
}
