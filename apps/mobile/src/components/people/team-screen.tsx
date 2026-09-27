import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SocketEvents } from '@hbcfield/shared/client';
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
  const keep = (x: Colleague) =>
    (filter === 'all' || presenceKey(x.presence) === filter)
    && (!q || `${x.firstName} ${x.lastName} ${x.position ?? ''} ${x.spaceName ?? ''}`.toLowerCase().includes(q));
  const count = (k: Filter) => all.filter((x) => presenceKey(x.presence) === k).length;
  const message = (id: string) => router.push({ pathname: '/chat', params: { userId: id } } as never);

  const row = (x: Colleague) => (
    <Pressable
      key={x.id}
      onPress={canChat ? () => message(x.id) : undefined}
      disabled={!canChat}
      accessibilityRole={canChat ? 'button' : undefined}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(2.75), opacity: pressed ? 0.85 : 1 })}
    >
      <PersonAvatar person={x} presence={x.presence} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14.5 }}>{`${x.firstName} ${x.lastName}`}</AText>
        <AText variant="caption" tone="muted" numberOfLines={1}>{[x.position, x.spaceName].filter(Boolean).join(' · ') || presenceText(x.presence, t)}</AText>
      </View>
      {canChat ? <RoundButton Glyph={MessagesGlyph} tone="jade" size={40} label={t('team.message', { defaultValue: 'Message {{name}}', name: x.firstName })} onPress={() => message(x.id)} /> : null}
    </Pressable>
  );

  const section = (label: string, list: Colleague[]) => {
    const shown = list.filter(keep);
    if (!shown.length) return null;
    return (
      <View style={{ gap: amazen.space(2) }}>
        <SectionLabel style={{ paddingHorizontal: amazen.space(1), paddingTop: amazen.space(1) }}>{label}</SectionLabel>
        <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
          {shown.map((x, i) => <React.Fragment key={x.id}>{i > 0 ? <WellDivider /> : null}{row(x)}</React.Fragment>)}
        </Well>
      </View>
    );
  };

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader
        title={t('team.title', 'Team')}
        actions={canChat ? [{ label: unread ? `${t('chat.title', 'Messages')} · ${unread}` : t('chat.title', 'Messages'), onPress: () => router.push('/chat' as Href), active: unread > 0 }] : undefined}
        style={wide ?? undefined}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: tabSafe, gap: amazen.space(3) }, wide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={c.accent} colors={[c.accent]} />}
      >
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('team.search', 'Search the team')}
          placeholderTextColor={c.inkOnGlass}
          style={{ backgroundColor: c.glass, borderWidth: 1, borderColor: c.lineGlass, borderRadius: 16, paddingHorizontal: amazen.space(3.5), paddingVertical: amazen.space(3), color: c.inkStrong, fontFamily: amazen.font.sans, fontSize: 14 }}
        />
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

        {colleagues === null ? (
          <AText variant="caption" tone="onGlass" style={{ textAlign: 'center', paddingVertical: amazen.space(6) }}>{t('common.loading', 'Loading…')}</AText>
        ) : all.length === 0 ? (
          <Well style={{ padding: amazen.space(6), alignItems: 'center' }}>
            <AText variant="body" tone="ink">{t('team.empty')}</AText>
          </Well>
        ) : (
          <>
            {section(t('team.managers', 'Managers'), managers)}
            {section(t('team.members', 'Team'), members)}
            {all.filter(keep).length === 0 ? (
              <AText variant="caption" tone="onGlass" style={{ textAlign: 'center', paddingVertical: amazen.space(4) }}>{t('team.noMatch', 'Nobody matches.')}</AText>
            ) : null}
          </>
        )}
      </ScrollView>
    </Ground>
  );
}

function presenceText(p: string | null | undefined, t: import('i18next').TFunction) {
  if (p === 'AVAILABLE') return t('chat.presence.active', 'Active now');
  if (p === 'BUSY') return t('chat.presence.busy', 'Busy');
  if (p === 'AWAY') return t('chat.presence.away', 'Away');
  return t('chat.presence.offline', 'Offline');
}
