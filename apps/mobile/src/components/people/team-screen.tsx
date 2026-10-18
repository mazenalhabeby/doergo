import React from 'react';
import { SectionList, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useSocketContext } from '../../contexts/socket-context';
import { useLiveRefresh } from '../../hooks/use-live-refresh';
import { useChatBadge } from '../../lib/chat-badge';
import { TeamMessages } from './team-messages';
import { useResponsive } from '../../lib/responsive';
import { tabAccessFor } from '../../lib/tab-layout';
import { Ground, ScreenHeader, SectionLabel } from '../amazen';
import { centeredContent } from '../screen-container';
import { MessagesGlyph } from '../glyphs/glyphs';
import { useTeamScreen } from './use-team-screen';
import { TeamSeparator, TeamRow } from './team-screen-helpers';
import { refreshControl } from '../pull-refresh';

/**
 * TEAM — two halves on one tab: PEOPLE (who is here) and MESSAGES (every
 * conversation). Chosen 2026-10-15 over a separate Chat tab: the bar is full
 * (Home · Jobs · Clock · Team + More) and managers need the live "who is free"
 * list one tap away as much as workers need their messages.
 *
 * It opens on Messages when something is unread (the tab shows the number),
 * otherwise on the half used last (lib/team-half). A member without chat sees
 * People only — asked the same question the tab bar asks (`tabAccessFor`).
 *
 * ⚠️ THE CALL BUTTON IS GONE. It only ever said "calls are coming soon"; a
 * button that does nothing is worse than none.
 *
 * Presence is live: a socket event patches the one person who changed.
 */
export function TeamScreen() {
  const {
    amazen,
    c,
    t,
    tabSafe,
    wide,
    canChat,
    half,
    refreshing,
    refresh,
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
  } = useTeamScreen();

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader
        title={t('team.title', 'Team')}
        tour={{ title: 'team-header' }}
        actions={
          canChat && half === 'messages'
            ? [
                {
                  label: `＋ ${t('chat.new', 'New')}`,
                  a11yLabel: t('chat.newMessage', 'New message'),
                  onPress: newChat,
                },
              ]
            : undefined
        }
        style={wide ?? undefined}
      />
      {canChat && half === 'messages' ? (
        <TeamMessages header={<View style={wide ?? undefined}>{switcher}</View>} />
      ) : (
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
          ListHeaderComponent={
            <>
              {switcher}
              {listHeader}
            </>
          }
          ListEmptyComponent={empty}
          contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: tabSafe }, wide]}
          refreshControl={refreshControl({ refreshing, onRefresh: () => void refresh(), color: c.accent })}
          renderSectionHeader={({ section }) => (
            <SectionLabel
              style={{
                paddingHorizontal: amazen.space(1),
                paddingTop: amazen.space(4),
                paddingBottom: amazen.space(2),
              }}
            >
              {section.label}
            </SectionLabel>
          )}
          ItemSeparatorComponent={TeamSeparator}
          renderItem={({ item, index, section }) => (
            <TeamRow
              person={live ? item : { ...item, presence: null }}
              canChat={canChat && item.canMessage !== false}
              onMessage={message}
              onOpen={profile}
              first={index === 0}
              last={index === section.data.length - 1}
              tour={item.id === firstShownId}
            />
          )}
        />
      )}
    </Ground>
  );
}
