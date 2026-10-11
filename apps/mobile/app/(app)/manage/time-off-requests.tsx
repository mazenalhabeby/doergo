import { useState, useCallback, useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, type Href } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { personName } from '@hbcfield/shared/client';
import { useTheme } from '../../../src/contexts/theme-context';
import { useToast } from '../../../src/island/island-context';
import { timeOffApi } from '../../../src/lib/api';
import { useResponsive } from '../../../src/lib/responsive';
import { centeredContent } from '../../../src/components/screen-container';
import { AText, FilterPill, FilterRow, Ground, HeaderBack, PrimaryButton, ScreenHeader, Well, useTabSafe } from '../../../src/components/amazen';
import { Initials, JobSheet } from '../../../src/components/job/job-ui';
import { RequestRow, useRequestWords, type RequestRowData } from '../../../src/components/requests/request-parts';

type StatusFilter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
const FILTER_KEYS: StatusFilter[] = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'];

/** Waiting first, then the newest. */
function byWaitingThenNewest(a: RequestRowData, b: RequestRowData): number {
  if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
  if (b.status === 'PENDING' && a.status !== 'PENDING') return 1;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

/**
 * REQUESTS TO DECIDE — every kind (leave, remote, changed hours, overtime,
 * other), each with what it needs to be decided: who, what, when, where, how
 * long, and their words. Approve or reject, exactly as for leave.
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
  const [requests, setRequests] = useState<RequestRowData[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('PENDING');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<RequestRowData | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await timeOffApi.listOrg();
      setRequests([...rows].sort(byWaitingThenNewest));
    } catch (err: unknown) {
      if ((err as { statusCode?: number })?.statusCode === 401) return;
      setRequests((cur) => cur ?? []);
      toast.error(t('common.error'), (err as Error)?.message || t('manage.timeOffRequestsScreen.failedToLoad'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const decide = async (request: RequestRowData, approved: boolean) => {
    setActionLoading(request.id);
    try {
      await timeOffApi.approve(request.id, { approved });
      await load();
    } catch (err: unknown) {
      toast.error(t('common.error'), (err as Error)?.message || t(approved ? 'manage.timeOffRequestsScreen.failedToApprove' : 'manage.timeOffRequestsScreen.failedToReject'));
    } finally {
      setActionLoading(null);
    }
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    const target = rejectTarget;
    setRejectTarget(null);
    await decide(target, false);
  };

  const filtered = useMemo(() => (requests ?? []).filter((x) => filter === 'ALL' || x.status === filter), [requests, filter]);
  const filterLabel = (f: StatusFilter) => t(`manage.timeOffRequestsScreen.filters.${f.toLowerCase()}`);

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.navigate('/(app)/(tabs)/manage' as Href);
  };

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader title={t('manage.titles.timeOffRequests')} leading={<HeaderBack onPress={back} />} style={wide ?? undefined} />
      <View style={[{ paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(2) }, wide]}>
        <FilterRow>
          {FILTER_KEYS.map((f) => <FilterPill key={f} label={filterLabel(f)} on={filter === f} onPress={() => setFilter(f)} />)}
        </FilterRow>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: tabSafe, gap: amazen.space(3) }, wide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={c.accent} colors={[c.accent]} />}
      >
        {requests === null ? (
          <AText variant="caption" tone="onGlass" style={{ paddingVertical: amazen.space(4), textAlign: 'center' }}>{t('common.loading', 'Loading…')}</AText>
        ) : filtered.length === 0 ? (
          <Well style={{ paddingVertical: amazen.space(8), paddingHorizontal: amazen.space(5), alignItems: 'center', gap: amazen.space(2) }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.accentTint, alignItems: 'center', justifyContent: 'center' }}>
              <AText variant="h2" tone="accent">✓</AText>
            </View>
            <AText variant="body" tone="ink" style={{ textAlign: 'center' }}>
              {filter !== 'ALL' ? t('manage.timeOffRequestsScreen.noRequests', { filter: filterLabel(filter) }) : t('manage.timeOffRequestsScreen.noRequestsAll')}
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
                  <AText variant="body" tone="strong" numberOfLines={1} style={{ flex: 1, fontSize: 15, fontFamily: amazen.font.sansMedium }}>
                    {personName(item.technician) || t('shiftReminder.unknownWorker')}
                  </AText>
                </View>
                <RequestRow request={item} />
                {note ? <AText variant="body" tone="ink" numberOfLines={4} style={{ fontSize: 13.5, lineHeight: 20 }}>{note}</AText> : null}
                {item.rejectionReason ? <AText variant="caption" tone="critical" style={{ fontSize: 13 }}>{item.rejectionReason}</AText> : null}
                {pending ? (
                  <View style={{ flexDirection: 'row', gap: amazen.space(2), marginTop: amazen.space(1) }}>
                    <Pressable
                      onPress={() => setRejectTarget(item)}
                      disabled={actionLoading === item.id}
                      accessibilityRole="button"
                      style={({ pressed }) => ({ borderRadius: amazen.radius.full, paddingHorizontal: amazen.space(4.5), minHeight: amazen.layout.tapMin + 2, alignItems: 'center', justifyContent: 'center', backgroundColor: c.tile, opacity: pressed || actionLoading === item.id ? 0.6 : 1 })}
                    >
                      <AText variant="body" tone="ink" style={{ fontSize: 15 }}>{t('common.reject')}</AText>
                    </Pressable>
                    <PrimaryButton style={{ flex: 1 }} label={t('common.approve')} onPress={() => void decide(item, true)} loading={actionLoading === item.id} />
                  </View>
                ) : null}
              </Well>
            );
          })
        )}
      </ScrollView>

      <JobSheet visible={!!rejectTarget} onClose={() => setRejectTarget(null)} title={t('manage.timeOffRequestsScreen.rejectConfirmTitle')}>
        <AText variant="body" tone="ink" style={{ fontSize: 14, lineHeight: 21 }}>{t('manage.timeOffRequestsScreen.rejectConfirmMessage')}</AText>
        <PrimaryButton label={t('common.cancel')} onPress={() => setRejectTarget(null)} />
        <Pressable onPress={() => void confirmReject()} accessibilityRole="button" style={{ alignSelf: 'center', padding: amazen.space(2) }}>
          <AText variant="body" tone="critical" style={{ fontSize: 14.5 }}>{t('common.reject')}</AText>
        </Pressable>
      </JobSheet>
    </Ground>
  );
}
