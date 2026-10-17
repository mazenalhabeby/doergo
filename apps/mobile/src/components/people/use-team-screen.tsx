import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SocketEvents, personName } from '@hbcfield/shared/client';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useSocketContext } from '../../contexts/socket-context';
import { useLiveRefresh } from '../../hooks/use-live-refresh';
import { chatApi, teamApi, type Colleague } from '../../lib/api';
import { useChatBadge } from '../../lib/chat-badge';
import { loadTeamHalf, openingHalf, rememberTeamHalf, type TeamHalf } from '../../lib/team-half';
import { useResponsive } from '../../lib/responsive';
import { tabAccessFor } from '../../lib/tab-layout';
import { AText, ChoicePill, GlassInput, Well, useTabSafe } from '../amazen';
import { centeredContent } from '../screen-container';
import { PRESENCE_DOT, presenceKey } from './person-avatar';
import { TourTarget, useTourScroll } from '../tour/tour-target';

export type Filter = 'all' | 'AVAILABLE' | 'BUSY' | 'AWAY';

/** TeamScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useTeamScreen() {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const tabSafe = useTabSafe();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(720) : null;
  const { subscribe, isAuthenticated } = useSocketContext();
  const canChat = useMemo(() => tabAccessFor(user as never).chat, [user]);
  // "New group" is offered only to who may start one (managers and leaders); unknown offline = no.
  const [mayCreateGroup, setMayCreateGroup] = useState(false);
  useEffect(() => {
    if (canChat)
      chatApi
        .capabilities()
        .then((c) => setMayCreateGroup(!!c.mayCreateGroup))
        .catch(() => undefined);
  }, [canChat]);

  const params = useLocalSearchParams<{ half?: string }>();
  const unread = useChatBadge();
  const [half, setHalfState] = useState<TeamHalf>(() => (canChat ? openingHalf(params.half, unread) : 'people'));
  const setHalf = useCallback((h: TeamHalf) => {
    setHalfState(h);
    rememberTeamHalf(h);
  }, []);
  // A link or push that names a half wins; otherwise the remembered one, once it has been read.
  useEffect(() => {
    if (!canChat) return;
    if (params.half === 'people' || params.half === 'messages') {
      setHalfState(params.half);
      return;
    }
    if (unread === 0)
      void loadTeamHalf().then((h) => {
        if (h) setHalfState(h);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.half, canChat]);
  const [colleagues, setColleagues] = useState<Colleague[] | null>(null);
  const [managerList, setManagerList] = useState<Colleague[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [team, mgrs] = await Promise.all([
      teamApi.list().catch(() => [] as Colleague[]),
      teamApi.managers().catch(() => [] as Colleague[]),
    ]);
    setColleagues(team);
    setManagerList(mgrs);
  }, []);
  useLiveRefresh(load, null);

  // Live presence: patch the one person whose status changed.
  useEffect(() => {
    if (!isAuthenticated) return;
    return subscribe(SocketEvents.PRESENCE_CHANGED, (d: { userId: string; presence: string | null }) => {
      const patch = (prev: Colleague[] | null) =>
        prev?.map((x) => (x.id === d.userId ? { ...x, presence: d.presence as Colleague['presence'] } : x)) ?? prev;
      setColleagues(patch);
      setManagerList((p) => patch(p) ?? p);
    });
  }, [isAuthenticated, subscribe]);

  // Managers are the org-wide contact list; the team is everyone else.
  const { managers, members, all } = useMemo(() => {
    const ids = new Set(managerList.map((m) => m.id));
    const rest = (colleagues ?? []).filter((x) => !ids.has(x.id));
    return { managers: managerList, members: rest, all: [...managerList, ...rest] };
  }, [managerList, colleagues]);

  const q = query.trim().toLowerCase();
  const keep = useCallback((x: Colleague) =>
    (filter === 'all' || presenceKey(x.presence) === filter)
    && (!q || `${personName(x)} ${x.position ?? ''} ${x.spaceName ?? ''}`.toLowerCase().includes(q)), [filter, q]);
  const count = (k: Filter) => all.filter((x) => presenceKey(x.presence) === k).length;
  const tourScroll = useTourScroll();
  // Stable, so `memo(TeamRow)` holds: a presence change redraws one row, not the list.
  const message = useCallback((id: string) => router.push({ pathname: '/chat', params: { userId: id } } as never), [router]);
  const profile = useCallback(
    (id: string) => router.push({ pathname: '/(app)/person/[id]', params: { id } } as never),
    [router],
  );
  // Presence is live or not shown: with no connection a kept "Available" is yesterday's news.
  const live = isAuthenticated;

  /*
    ⚠️ VIRTUALISED. An organization's team can be hundreds of people, and the
    old column drew every one of them (avatar and all) on open. The wells are a
    `SectionList` whose rows draw their own slice of the well, as on Jobs.
  */
  const sections = useMemo(() => {
    const out: { key: string; label: string; data: Colleague[] }[] = [];
    const m = managers.filter(keep);
    const rest = members.filter(keep);
    if (m.length) out.push({ key: 'managers', label: t('team.managers', 'Managers'), data: m });
    if (rest.length) out.push({ key: 'members', label: t('team.members', 'Team'), data: rest });
    return out;
  }, [managers, members, keep, t]);
  // The one row the tour rings: the first person on screen, whichever section it is in.
  const firstShownId = sections[0]?.data[0]?.id ?? null;

  const listHeader = (
    <View style={{ gap: amazen.space(3) }}>
      <TourTarget name="team-search">
      <GlassInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('team.search', 'Search the team')}
      />
      </TourTarget>
      <TourTarget name="team-filters">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: amazen.space(1.5) }}>
        {(['all', 'AVAILABLE', 'BUSY', 'AWAY'] as const).map((k) => {
          const on = k === filter;
          const n = k === 'all' ? all.length : count(k);
          return (
            <ChoicePill
              key={k}
              on={on}
              onPress={() => setFilter(k)}
              dot={k !== 'all' ? PRESENCE_DOT[k] : null}
              label={k === 'all' ? t('team.filter.all', { count: n, defaultValue: 'All {{count}}' }) : t(`team.filter.${k}`, { count: n })}
            />
          );
        })}
      </ScrollView>
      </TourTarget>
    </View>
  );

  const empty = colleagues === null ? (
    <AText variant="caption" tone="onGlass" style={{ textAlign: 'center', paddingVertical: amazen.space(6) }}>
      {t('common.loading', 'Loading…')}
    </AText>
  ) : all.length === 0 ? (
    <Well style={{ padding: amazen.space(6), alignItems: 'center', marginTop: amazen.space(3) }}>
      <AText variant="body" tone="ink">{t('team.empty')}</AText>
    </Well>
  ) : (
    <AText
      variant="caption"
      tone="onGlass"
      style={{ textAlign: 'center', paddingVertical: amazen.space(4), marginTop: amazen.space(3) }}
    >
      {t('team.noMatch', 'Nobody matches.')}
    </AText>
  );

  const switcher = canChat ? (
    <TourTarget name="team-messages">
      <View
        accessibilityRole="tablist"
        style={{ flexDirection: 'row', gap: amazen.space(1.5), marginBottom: amazen.space(3) }}
      >
        <ChoicePill on={half === 'people'} onPress={() => setHalf('people')} label={t('team.people', 'People')} />
        <ChoicePill
          on={half === 'messages'}
          onPress={() => setHalf('messages')}
          label={t('chat.title', 'Messages')}
          count={unread}
        />
      </View>
    </TourTarget>
  ) : null;

  const newChat = () => {
    if (!mayCreateGroup) {
      router.push({ pathname: '/chat', params: { new: '1' } } as never);
      return;
    }
    Alert.alert(t('chat.new', 'New'), undefined, [
      {
        text: t('chat.newMessage', 'New message'),
        onPress: () => router.push({ pathname: '/chat', params: { new: '1' } } as never),
      },
      {
        text: t('chat.newGroup', 'New group'),
        onPress: () => router.push({ pathname: '/chat', params: { new: 'group' } } as never),
      },
      { text: t('common.cancel', 'Cancel'), style: 'cancel' },
    ]);
  };

  return {
    amazen,
    c,
    t,
    tabSafe,
    wide,
    canChat,
    half,
    refreshing,
    setRefreshing,
    load,
    tourScroll,
    message,
    profile,
    live,
    sections,
    firstShownId,
    listHeader,
    empty,
    switcher,
    newChat,
  };
}
