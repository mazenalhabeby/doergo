import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, SectionList, TextInput, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SocketEvents, personName } from '@hbcfield/shared/client';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useSocketContext } from '../../contexts/socket-context';
import { useLiveRefresh } from '../../hooks/use-live-refresh';
import { chatApi, teamApi, type Colleague } from '../../lib/api';
import { useResponsive } from '../../lib/responsive';
import { tabAccessFor } from '../../lib/tab-layout';
import { AText, Ground, ScreenHeader, Well, WellDivider, useTabSafe } from '../amazen';
import { centeredContent } from '../screen-container';
import { RoundButton, SectionLabel } from '../job/job-ui';
import { MessagesGlyph } from '../glyphs/glyphs';
import { PersonAvatar, PRESENCE_DOT, presenceKey } from './person-avatar';
import { TourTarget, useTourScroll } from '../tour/tour-target';

type Filter = 'all' | 'AVAILABLE' | 'BUSY' | 'AWAY';

/**
 * TEAM — who is here, and a message to any of them.
 *
 * ⚠️ IT IS THE WAY INTO CHAT NOW. Team took Messages' slot in the tab bar, so
 * the header carries a Messages pill with the unread count, and every person
 * a message button. A member without chat sees neither — the pill and the
 * buttons are asked the same question the tab bar asks (`tabAccessFor`).
 *
 * ⚠️ THE CALL BUTTON IS GONE. It only ever said "calls are coming soon"; a
 * button that does nothing is worse than none.
 *
 * Presence is live: a socket event patches the one person who changed.
 */
export function TeamScreen() {
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

  const [colleagues, setColleagues] = useState<Colleague[] | null>(null);
  const [managerList, setManagerList] = useState<Colleague[]>([]);
  const [unread, setUnread] = useState(0);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [team, mgrs, convs] = await Promise.all([
      teamApi.list().catch(() => [] as Colleague[]),
      teamApi.managers().catch(() => [] as Colleague[]),
      // Only somebody who can chat asks how many are unread.
      canChat ? chatApi.conversations().catch(() => []) : Promise.resolve([]),
    ]);
    setColleagues(team);
    setManagerList(mgrs);
    setUnread(convs.reduce((a, x) => a + (x.unread ?? 0), 0));
  }, [canChat]);
  useLiveRefresh(load, null);

  // Live presence: patch the one person whose status changed.
  useEffect(() => {
    if (!isAuthenticated) return;
    return subscribe(SocketEvents.PRESENCE_CHANGED, (d: { userId: string; presence: string | null }) => {
      const patch = (prev: Colleague[] | null) => prev?.map((x) => (x.id === d.userId ? { ...x, presence: d.presence as Colleague['presence'] } : x)) ?? prev;
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
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('team.search', 'Search the team')}
        placeholderTextColor={c.inkOnGlass}
        style={{ backgroundColor: c.glass, borderWidth: 1, borderColor: c.lineGlass, borderRadius: 16, paddingHorizontal: amazen.space(3.5), paddingVertical: amazen.space(3), color: c.inkStrong, fontFamily: amazen.font.sans, fontSize: 14 }}
      />
      </TourTarget>
      <TourTarget name="team-filters">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: amazen.space(1.5) }}>
        {(['all', 'AVAILABLE', 'BUSY', 'AWAY'] as const).map((k) => {
          const on = k === filter;
          const n = k === 'all' ? all.length : count(k);
          return (
            <Pressable key={k} onPress={() => setFilter(k)} accessibilityRole="button" accessibilityState={{ selected: on }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: amazen.radius.full, paddingHorizontal: amazen.space(3), paddingVertical: amazen.space(1.75), backgroundColor: on ? c.accentTint : c.tile, borderWidth: 1.5, borderColor: on ? c.accent : 'transparent' }}>
              {k !== 'all' ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: PRESENCE_DOT[k] }} /> : null}
              <AText variant="caption" style={{ fontSize: 12.5, color: on ? c.accent : c.ink }}>
                {k === 'all' ? t('team.filter.all', { count: n, defaultValue: 'All {{count}}' }) : t(`team.filter.${k}`, { count: n })}
              </AText>
            </Pressable>
          );
        })}
      </ScrollView>
      </TourTarget>
    </View>
  );

  const empty = colleagues === null ? (
    <AText variant="caption" tone="onGlass" style={{ textAlign: 'center', paddingVertical: amazen.space(6) }}>{t('common.loading', 'Loading…')}</AText>
  ) : all.length === 0 ? (
    <Well style={{ padding: amazen.space(6), alignItems: 'center', marginTop: amazen.space(3) }}>
      <AText variant="body" tone="ink">{t('team.empty')}</AText>
    </Well>
  ) : (
    <AText variant="caption" tone="onGlass" style={{ textAlign: 'center', paddingVertical: amazen.space(4), marginTop: amazen.space(3) }}>{t('team.noMatch', 'Nobody matches.')}</AText>
  );

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader
        title={t('team.title', 'Team')}
        tour={{ title: 'team-header' }}
        actions={canChat ? [{ label: unread ? `${t('chat.title', 'Messages')} · ${unread}` : t('chat.title', 'Messages'), onPress: () => router.push('/chat' as Href), active: unread > 0, tourKey: 'team-messages' }] : undefined}
        style={wide ?? undefined}
      />
      <SectionList
        {...tourScroll}
        sections={sections}
        keyExtractor={(x) => x.id}
        stickySectionHeadersEnabled={false}
        initialNumToRender={14}
        windowSize={11}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={listHeader}
        ListEmptyComponent={empty}
        contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: tabSafe }, wide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={c.accent} colors={[c.accent]} />}
        renderSectionHeader={({ section }) => (
          <SectionLabel style={{ paddingHorizontal: amazen.space(1), paddingTop: amazen.space(4), paddingBottom: amazen.space(2) }}>{section.label}</SectionLabel>
        )}
        ItemSeparatorComponent={TeamSeparator}
        renderItem={({ item, index, section }) => (
          <TeamRow
            person={item}
            canChat={canChat}
            onMessage={message}
            first={index === 0}
            last={index === section.data.length - 1}
            tour={item.id === firstShownId}
          />
        )}
      />
    </Ground>
  );
}

/** The hairline between two people — drawn on the well, so the well has no gap in it. */
function TeamSeparator() {
  const { amazen } = useTheme();
  return <View style={{ backgroundColor: amazen.color.well, paddingHorizontal: amazen.space(3.5) }}><WellDivider /></View>;
}

/** One person: their slice of the well, the first and last rounding its corners. */
const TeamRow = memo(function TeamRow({ person: x, canChat, onMessage, first, last, tour }: {
  person: Colleague;
  canChat: boolean;
  onMessage: (id: string) => void;
  first: boolean;
  last: boolean;
  tour: boolean;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const radius = amazen.radius.panel;
  const row = (
    <Pressable
      onPress={canChat ? () => onMessage(x.id) : undefined}
      disabled={!canChat}
      accessibilityRole={canChat ? 'button' : undefined}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(2.75), opacity: pressed ? 0.85 : 1 })}
    >
      <PersonAvatar person={x} presence={x.presence} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14.5 }}>{personName(x)}</AText>
        <AText variant="caption" tone="muted" numberOfLines={1}>{[x.position, x.spaceName].filter(Boolean).join(' · ') || presenceText(x.presence, t)}</AText>
      </View>
      {canChat ? <RoundButton Glyph={MessagesGlyph} tone="jade" size={40} label={t('team.message', { defaultValue: 'Message {{name}}', name: x.firstName })} onPress={() => onMessage(x.id)} /> : null}
    </Pressable>
  );
  return (
    <View
      style={{
        backgroundColor: c.well, paddingHorizontal: amazen.space(3.5),
        ...(first ? { borderTopLeftRadius: radius, borderTopRightRadius: radius } : null),
        ...(last ? { borderBottomLeftRadius: radius, borderBottomRightRadius: radius } : null),
      }}
    >
      {tour ? <TourTarget name="team-person">{row}</TourTarget> : row}
    </View>
  );
});

function presenceText(p: string | null | undefined, t: import('i18next').TFunction) {
  if (p === 'AVAILABLE') return t('chat.presence.active', 'Active now');
  if (p === 'BUSY') return t('chat.presence.busy', 'Busy');
  if (p === 'AWAY') return t('chat.presence.away', 'Away');
  return t('chat.presence.offline', 'Offline');
}
