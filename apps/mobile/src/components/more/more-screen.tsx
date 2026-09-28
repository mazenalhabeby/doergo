import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useFocusEffect, useNavigation, useNavigationState } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useResponsive } from '../../lib/responsive';
import { manageRowsFor, type ManageRow } from '../../lib/manage-rows';
import { holds } from '../../lib/permissions';
import { splitTabs, tabAccessFor, tabVisible, TAB_TITLE_KEY } from '../../lib/tab-layout';
import { attendanceApi } from '../../lib/api/attendance';
import { joinRequestsApi, timeOffApi } from '../../lib/api';
import { AText, Ground, ScreenHeader, Well, WellDivider, useTabSafe } from '../amazen';
import { centeredContent } from '../screen-container';
import { SectionLabel } from '../job/job-ui';
import { TAB_GLYPHS } from '../glyphs/tab-glyphs';
import { SHORTCUT_GLYPHS } from '../home/shortcut-glyphs';
import { ShiftIssueListSheet, ShiftIssueThreadSheet } from '../shift-issue-sheet';
import { groupManageRows, type MoreGroup } from './more-groups';
import { TourTarget, useTourScroll } from '../tour/tour-target';

/**
 * MORE — the tab bar's •••, as a page.
 *
 * ⚠️ IT WAS A POPUP LIST, and a list with no room: nine management doors, each
 * a coloured icon, one long scroll in a sheet. As a page it keeps the bar (with
 * ••• lit, so you know where you are), groups the doors by what they are for,
 * and says where work is waiting before you open anything.
 *
 * ⚠️ ONLY WHAT YOU CAN OPEN — the tiles are the tabs that did not fit the bar
 * (the SAME `tabVisible` + `splitTabs` the bar uses) and the rows are
 * `manageRowsFor(user)`, the permission table the old sheet read. Nothing here
 * decides access a second time.
 *
 * ⚠️ A COUNT IS ASKED ONLY FOR A ROW YOU HAVE. Somebody who cannot approve
 * leave makes no leave request; each count is one call, on focus.
 */
export function MoreScreen() {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const navigation = useNavigation<{ navigate: (name: string) => void }>();
  const tabSafe = useTabSafe();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(720) : null;

  // The tabs that did not fit — the bar's own answer, from the navigator's routes.
  const routeNames = useNavigationState((s) => s.routes.map((x) => x.name)) as string[];
  const access = useMemo(() => tabAccessFor(user as never), [user]);
  const rows = useMemo(() => manageRowsFor(user || {}), [user]);
  const overflow = useMemo(() => {
    const visible = routeNames.filter((n) => tabVisible(n, access)).map((name) => ({ name }));
    return splitTabs(visible, rows.length > 0).overflowRoutes.map((x) => x.name);
  }, [routeNames, access, rows.length]);
  const groups = useMemo(() => groupManageRows(rows), [rows]);

  /* ---------------- what waits ---------------- */
  const [counts, setCounts] = useState<Record<string, number>>({});
  const has = (route: string) => rows.some((x) => x.route === route);
  const loadCounts = useCallback(async () => {
    const asks: Array<[string, Promise<unknown[]>]> = [];
    if (has('/(app)/extra-time')) asks.push(['/(app)/extra-time', attendanceApi.getPendingExtraTime()]);
    if (has('/(app)/manage/time-off-requests')) asks.push(['/(app)/manage/time-off-requests', timeOffApi.listOrg('PENDING')]);
    if (has('/(app)/manage/join-requests')) asks.push(['/(app)/manage/join-requests', joinRequestsApi.list({ status: 'PENDING' })]);
    const done = await Promise.allSettled(asks.map(([, p]) => p));
    const next: Record<string, number> = {};
    done.forEach((d, i) => { if (d.status === 'fulfilled' && Array.isArray(d.value)) next[asks[i][0]] = d.value.length; });
    setCounts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);
  useFocusEffect(useCallback(() => { void loadCounts(); }, [loadCounts]));
  const [refreshing, setRefreshing] = useState(false);

  /* ---------------- shift issues are sheets, not a route ---------------- */
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [issueId, setIssueId] = useState<string | null>(null);

  const tourScroll = useTourScroll();

  const open = (row: ManageRow) => {
    if (row.route === 'sheet:issues') setIssuesOpen(true);
    else router.push(row.route as Href);
  };

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader title={t('tabs.more', 'More')} tour={{ title: 'more-header' }} style={wide ?? undefined} />
      <ScrollView
        {...tourScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: tabSafe, gap: amazen.space(3) }, wide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadCounts(); setRefreshing(false); }} tintColor={c.accent} colors={[c.accent]} />}
      >
        {overflow.length ? (
          <TourTarget name="more-tiles" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(2) }}>
            {overflow.map((name) => {
              const G = TAB_GLYPHS[name];
              return (
                <Pressable
                  key={name}
                  onPress={() => navigation.navigate(name)}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    flexBasis: '48%', flexGrow: 1, gap: amazen.space(2.5), padding: amazen.space(3.5), borderRadius: 20,
                    backgroundColor: c.glass, borderWidth: 1, borderColor: c.lineGlass, opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.accentTint, alignItems: 'center', justifyContent: 'center' }}>
                    {G ? <G size={20} color={c.accent} /> : null}
                  </View>
                  <View>
                    <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14.5, fontFamily: amazen.font.sansMedium }}>{t(TAB_TITLE_KEY[name] ?? name)}</AText>
                    <AText variant="caption" tone="onGlass" numberOfLines={1}>{t(`more.tab.${name}`, '')}</AText>
                  </View>
                </Pressable>
              );
            })}
          </TourTarget>
        ) : null}

        {groups.map((g: MoreGroup, gi: number) => (
          <GroupAnchor key={g.key} first={gi === 0}>
            <SectionLabel style={{ paddingHorizontal: amazen.space(1), paddingTop: amazen.space(1) }}>{t(`more.group.${g.key}`)}</SectionLabel>
            <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
              {g.rows.map((row, i) => {
                const G = SHORTCUT_GLYPHS[row.labelKey];
                const n = counts[row.route] ?? 0;
                return (
                  <React.Fragment key={row.route}>
                    {i > 0 ? <WellDivider /> : null}
                    <Pressable
                      onPress={() => open(row)}
                      accessibilityRole="button"
                      accessibilityLabel={n ? `${t(row.labelKey)}, ${t('more.waiting', { count: n, defaultValue: '{{count}} waiting' })}` : t(row.labelKey)}
                      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(3), opacity: pressed ? 0.8 : 1 })}
                    >
                      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.accentTint, alignItems: 'center', justifyContent: 'center' }}>
                        {G ? <G size={20} color={c.accent} contrast={c.well} /> : null}
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14.5 }}>{t(row.labelKey)}</AText>
                        <AText variant="caption" tone="muted" numberOfLines={1}>{t(row.descKey)}</AText>
                      </View>
                      {n ? (
                        <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: c.warnTint, alignItems: 'center', justifyContent: 'center' }}>
                          <AText variant="caption" tone="warn" numeric>{String(n)}</AText>
                        </View>
                      ) : null}
                      <AText variant="body" tone="muted">›</AText>
                    </Pressable>
                  </React.Fragment>
                );
              })}
            </Well>
          </GroupAnchor>
        ))}
      </ScrollView>

      <ShiftIssueListSheet visible={issuesOpen} onClose={() => setIssuesOpen(false)} onOpen={(id) => { setIssuesOpen(false); setIssueId(id); }} />
      <ShiftIssueThreadSheet
        visible={!!issueId}
        issueId={issueId}
        onClose={() => setIssueId(null)}
        /* Whether the actions render is the server's call in the end; this asks the same question the API does. */
        canManage={holds(user, 'canViewAllTasks')}
        currentUserId={user?.id}
      />
    </Ground>
  );
}

/** A group of rows; the FIRST is the tour's "everything else lives here" step. */
function GroupAnchor({ first, children }: { first: boolean; children: React.ReactNode }) {
  const { amazen } = useTheme();
  return first ? (
    <TourTarget name="more-manage" style={{ gap: amazen.space(2) }}>{children}</TourTarget>
  ) : (
    <View style={{ gap: amazen.space(2) }}>{children}</View>
  );
}
