import { type ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, SectionList, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { oversees } from '@/lib/permissions';
import { useResponsive } from '@/lib/responsive';
import { countRouteStops } from '@/lib/my-route';
import { drivesRoutes } from '@/lib/member-reach';
import { ROUTES } from '@/lib/constants';
import { OfflineBanner } from '@/offline/components/offline-banner';
import { FreshnessLabel } from '@/offline/components/freshness-label';
import { Ground, AText, WellDivider, QuietButton, SectionLabel } from '@/components/amazen';
import { TourTarget } from '../tour';
import { centeredContent } from '@/components/screen-container';
import { useTaskFlows } from '../home/use-task-flows';
import type { OpenSheet } from '../job/job-logic';
import type { WriteStatus } from '../job/use-job-writes';
import { emptyKind, placeOf, rowRight, rowWho, PERIODS, type JobBand } from './jobs-logic';
import { FilterChips, SearchField, Segmented } from './jobs-controls';
import { JobRow } from './job-row';
import { NextUp } from './next-up';
import { RouteRow } from './route-row';
import { OpenForRole } from './open-for-role';
import { useJobsScreenData, s } from './use-jobs-screen-data';
export { s } from './use-jobs-screen-data';

/** The list is asked for 100 at a time; at the cap it says so rather than implying it is everything. */
export const PAGE = 100;

export const BAND_KEY: Record<JobBand, string> = {
  doing: 'jobsList.bands.doing',
  blocked: 'jobsList.bands.blocked',
  overdue: 'jobsList.bands.overdue',
  today: 'jobsList.bands.today',
  later: 'jobsList.bands.later',
  done: 'jobsList.bands.done',
};

/** The hairline between two rows — drawn on the well, so the well has no gap in it. Module scope: one component type, never remounted. */
export function WellSeparator() {
  const { amazen } = useTheme();
  return <View style={{ backgroundColor: amazen.color.well, paddingHorizontal: amazen.space(3.5) }}><WellDivider /></View>;
}

/** JobsScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useJobsScreen({
  writeStatus,
  renderDetail,
}: Pick<{
  /** The job page's one status write, handed down by the route (`task/[id].tsx`). */
  writeStatus: WriteStatus;
  /** The tablet's right-hand pane — `TaskDetailPane`, rendered by the route. */
  renderDetail: (taskId: string, sheet: OpenSheet | null, close: () => void) => ReactNode;
}, 'writeStatus' | 'renderDetail'>) {
  const {
    amazen,
    t,
    tabSafe,
    r,
    c,
    oversee,
    period,
    setFilter,
    search,
    setSearch,
    mineOnly,
    setMineOnly,
    selected,
    setSelected,
    roleRefresh,
    setRoleRefresh,
    list,
    tasks,
    flows,
    changePeriod,
    factsOf,
    filter,
    next,
    sections,
    routeStops,
    routeShown,
    filterOptions,
    open,
    openById,
    labelFor,
    wide,
    tourScroll,
    pad,
    header,
  } = useJobsScreenData({ writeStatus, renderDetail });

  const listHeader = (
    <View style={{ gap: amazen.space(3.5), paddingBottom: amazen.space(1) }}>
      <TourTarget name="tasks-search">
        <SearchField value={search} onChange={setSearch} placeholder={t('jobsList.search')} clearLabel={t('common.clear')} />
      </TourTarget>
      {oversee ? (
        <TourTarget name="tasks-scope">
        <Segmented
          options={[
            { key: 'mine', label: t('jobsList.scope.mine'), count: list.counts.mine },
            { key: 'all', label: t('jobsList.scope.everyone'), count: list.counts.all },
          ]}
          value={mineOnly ? 'mine' : 'all'}
          onChange={(k) => setMineOnly(k === 'mine')}
        />
        </TourTarget>
      ) : null}
      <TourTarget name="tasks-period">
        <Segmented options={PERIODS.map((p) => ({ key: p, label: t(`jobsList.period.${p}`) }))} value={period} onChange={changePeriod} />
      </TourTarget>
      <TourTarget name="tasks-filters">
        <FilterChips options={filterOptions} value={filter} onChange={setFilter} />
      </TourTarget>
      <OfflineBanner />
      {list.localUpdatedAt !== null ? (
        <View style={{ alignItems: 'flex-end', marginTop: -amazen.space(2) }}><FreshnessLabel at={list.localUpdatedAt} /></View>
      ) : null}
      {routeShown ? (
        <TourTarget name="tasks-route">
          <RouteRow stops={routeStops} onPress={() => router.push('/(app)/route-planner' as Href)} />
        </TourTarget>
      ) : null}
      {/* Jobs open to a work role I hold — the first to take each place gets it (shared tasks/role-pool.ts). */}
      <OpenForRole
        refreshKey={roleRefresh}
        onTaken={(id) => { void list.fetchTasks(); open({ id }); }}
        onOpen={(id) => open({ id })}
      />
      {next ? (
        <View style={{ gap: amazen.space(2) }}>
          <SectionLabel tone="accent">{t('tasks.myWork.next.label')}</SectionLabel>
          <TourTarget name="tasks-next">
            <NextUp
              task={next}
              flows={flows}
              writeStatus={writeStatus}
              onOpen={(sheet) => open(next, sheet)}
              onChanged={() => void list.fetchTasks()}
            />
          </TourTarget>
        </View>
      ) : null}
      {list.isLoading && tasks.length > 0 ? <ActivityIndicator size="small" color={c.accent} /> : null}
    </View>
  );

  const kind = emptyKind({ search, filter, period });
  const empty = list.isLoading ? (
    <View style={{ paddingVertical: amazen.space(10), alignItems: 'center' }}><ActivityIndicator color={c.accent} /></View>
  ) : list.error ? (
    <View
      style={{
        backgroundColor: c.well,
        borderRadius: amazen.radius.panel,
        padding: amazen.space(4),
        gap: amazen.space(3),
        marginTop: amazen.space(3.5),
      }}>
      <AText variant="body" tone="strong">{list.error}</AText>
      <QuietButton tone="accent" label={t('common.retry')} onPress={() => void list.fetchTasks()} />
    </View>
  ) : next ? null : (
    <View
      style={{
        backgroundColor: c.well,
        borderRadius: amazen.radius.panel,
        padding: amazen.space(4),
        gap: amazen.space(1),
        marginTop: amazen.space(3.5),
      }}>
      <AText variant="body" tone="strong" style={{ fontFamily: amazen.font.sansMedium, fontSize: 16, lineHeight: 22 }}>
        {t(`jobsList.empty.${kind}`)}
      </AText>
      <AText variant="caption" tone="ink">{t(kind === 'search' ? 'jobsList.empty.searchHint' : 'jobsList.empty.hint')}</AText>
    </View>
  );

  const footer = tasks.length >= PAGE ? (
    <AText variant="caption" tone="ink" style={{ textAlign: 'center', marginTop: amazen.space(4) }}>
      {t('jobsList.capped', { count: PAGE })}
    </AText>
  ) : null;

  const firstId = sections[0]?.data[0]?.id;

  const listView = (
    <Ground style={{ flex: 1 }}>
      {header}
      <SectionList
        {...tourScroll}
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        initialNumToRender={16}
        windowSize={11}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        contentContainerStyle={[{ paddingHorizontal: pad, paddingTop: amazen.space(1), paddingBottom: tabSafe }, wide]}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefreshing}
            onRefresh={() => {
              setRoleRefresh((k) => k + 1);
              void list.refresh();
            }}
            colors={[c.accentSolid]}
            tintColor={c.accent}
          />
        }
        renderSectionHeader={({ section }) => (
          <View style={[s.wellTop, { backgroundColor: c.well, marginTop: amazen.space(3.5), paddingHorizontal: amazen.space(3.5) }]}>
            <SectionLabel tone={section.band === 'blocked' ? 'critical' : section.band === 'overdue' ? 'warn' : 'muted'}>
              {`${t(BAND_KEY[section.band])} · ${section.data.length}`}
            </SectionLabel>
          </View>
        )}
        ItemSeparatorComponent={WellSeparator}
        renderItem={({ item, index, section }) => {
          const f = factsOf(item);
          const band = section.band as JobBand;
          const last = index === section.data.length - 1;
          const row = (
            <JobRow
              id={item.id}
              title={item.title}
              urgent={item.priority === 'URGENT'}
              band={band}
              mine={f.mine}
              closed={f.closed}
              who={rowWho(item as never, f, { oversee, everyone: !mineOnly })}
              place={placeOf(item as never)}
              right={rowRight(item, f)}
              stepLabel={labelFor(item)}
              onOpen={openById}
            />
          );
          return (
            <View
              style={[
                { backgroundColor: c.well, paddingHorizontal: amazen.space(3.5) },
                last ? [s.wellBottom, { paddingBottom: amazen.space(2) }] : null,
              ]}>
              {item.id === firstId ? <TourTarget name="tasks-card">{row}</TourTarget> : row}
            </View>
          );
        }}
      />
    </Ground>
  );

  return {
    amazen,
    t,
    r,
    c,
    selected,
    setSelected,
    listView,
  };
}
