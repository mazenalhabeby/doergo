import { useState, useCallback, useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, type Href } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { personName } from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import { useToast } from '@/island/island-context';
import { timeOffApi } from '@/lib/api';
import { useResponsive } from '@/lib/responsive';
import { centeredContent } from '@/components/screen-container';
import {
  AText,
  FilterPill,
  FilterRow,
  Ground,
  HeaderBack,
  ScreenHeader,
  Well,
  useTabSafe,
} from '@/components/amazen';
import { Initials, QuietButton } from '@/features/job/job-ui';
import { RequestRow, useRequestWords, type RequestRowData } from '@/features/requests/request-parts';
import { LoadingLine } from '@/components/loading-line';
import { refreshControl } from '@/components/pull-refresh';
import { useFetchData } from '@/hooks/use-fetch-data';

type StatusFilter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
const FILTER_KEYS: StatusFilter[] = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'];

/** Waiting first, then the newest. */
function byWaitingThenNewest(a: RequestRowData, b: RequestRowData): number {
  if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
  if (b.status === 'PENDING' && a.status !== 'PENDING') return 1;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

/**
 * THE TEAM'S REQUESTS — every kind (leave, remote, changed hours, overtime,
 * other): who, what, when, where, how long, their words, and how it ended.
 * Deciding one happens in Approvals — the one place; a waiting row links there.
 *
 * One request for the whole list (`timeOffApi.listOrg`): the server answers
 * with the organization for an org-wide holder and with their own crew for a
 * supervisor, and brings the member with each row.
 */
export default function RequestsToDecideScreen() {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();
  const tabSafe = useTabSafe();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(720) : null;
  const w = useRequestWords();
  const [filter, setFilter] = useState<StatusFilter>('ALL');

  const listSorted = useCallback(async () => [...(await timeOffApi.listOrg())].sort(byWaitingThenNewest), []);
  const fetched = useFetchData<RequestRowData[]>({
    fetcher: listSorted,
    // Every focus and every pull asks, as before; a failure shows what is there, or an empty list.
    dedupe: false,
    onError: (err, cur) => {
      toast.error(t('common.error'), (err as Error)?.message || t('manage.timeOffRequestsScreen.failedToLoad'));
      return cur ?? [];
    },
  });
  const requests = fetched.data ?? null;
  const load = fetched.fetchData;

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const filtered = useMemo(
    () => (requests ?? []).filter((x) => filter === 'ALL' || x.status === filter),
    [requests, filter],
  );
  const filterLabel = (f: StatusFilter) => t(`manage.timeOffRequestsScreen.filters.${f.toLowerCase()}`);

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.navigate('/(app)/(tabs)/manage' as Href);
  };

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader
        title={t('manage.titles.timeOffRequests')}
        leading={<HeaderBack onPress={back} />}
        style={wide ?? undefined}
      />
      <View style={[{ paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(2) }, wide]}>
        <FilterRow>
          {FILTER_KEYS.map((f) => (
            <FilterPill key={f} label={filterLabel(f)} on={filter === f} onPress={() => setFilter(f)} />
          ))}
        </FilterRow>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          { paddingHorizontal: amazen.space(4), paddingBottom: tabSafe, gap: amazen.space(3) },
          wide,
        ]}
        refreshControl={refreshControl({
          refreshing: fetched.isRefreshing,
          onRefresh: () => void fetched.refresh(),
          color: c.accent,
        })}
      >
        {requests === null ? (
          <LoadingLine onGlass padUnits={4} />
        ) : filtered.length === 0 ? (
          <Well
            style={{
              paddingVertical: amazen.space(8),
              paddingHorizontal: amazen.space(5),
              alignItems: 'center',
              gap: amazen.space(2),
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: c.accentTint,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AText variant="h2" tone="accent">
                ✓
              </AText>
            </View>
            <AText variant="body" tone="ink" style={{ textAlign: 'center' }}>
              {filter !== 'ALL'
                ? t('manage.timeOffRequestsScreen.noRequests', { filter: filterLabel(filter) })
                : t('manage.timeOffRequestsScreen.noRequestsAll')}
            </AText>
          </Well>
        ) : (
          filtered.map((item) => {
            const pending = item.status === 'PENDING';
            const note = w.describe(item).note;
            return (
              <Well key={item.id} style={{ padding: amazen.space(3.5), gap: amazen.space(2) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3) }}>
                  <Initials first={item.technician?.firstName} last={item.technician?.lastName} size={36} />
                  <AText
                    variant="body"
                    tone="strong"
                    numberOfLines={1}
                    style={{ flex: 1, fontSize: 15, fontFamily: amazen.font.sansMedium }}
                  >
                    {personName(item.technician) || t('shiftReminder.unknownWorker')}
                  </AText>
                </View>
                <RequestRow request={item} />
                {note ? (
                  <AText variant="body" tone="ink" numberOfLines={4} style={{ fontSize: 13.5, lineHeight: 20 }}>
                    {note}
                  </AText>
                ) : null}
                {item.rejectionReason ? (
                  <AText variant="caption" tone="critical" style={{ fontSize: 13 }}>
                    {item.rejectionReason}
                  </AText>
                ) : null}
                {pending ? (
                  <QuietButton
                    tone="accent"
                    label={t('approvals.decideInApprovals')}
                    onPress={() => router.push('/(app)/approvals?kind=request' as Href)}
                  />
                ) : null}
              </Well>
            );
          })
        )}
      </ScrollView>
    </Ground>
  );
}
