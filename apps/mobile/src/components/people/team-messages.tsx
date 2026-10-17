import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  SocketEvents,
  applyChangedToConversations,
  applyRead,
  applyToConversations,
  chatSearchQuery,
  conversationTitle,
  markReadLocally,
  chatWhenShort,
  type ChatConversation,
  type ChatSearchHit,
} from '@hbcfield/shared/client';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useSocketContext } from '../../contexts/socket-context';
import { chatApi } from '../../lib/api';
import { useOffline } from '../../offline/offline-context';
import { useAppResume } from '../../lib/app-resume';
import { AText, GlassInput, Well, WellDivider, useTabSafe, Banner } from '../amazen';
import { ConversationAvatar, ConversationRow } from '../chat/chat-rows';
import { Arrive } from '../amazen/motion';
import { InkIcon } from '../amazen/ink-icon';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { debounce } from '../chat/live-thread';
import { refreshChatBadge } from '../../lib/chat-badge';
import { useTeamMessages } from './use-team-messages';
import { LoadingLine } from '../loading-line';

/**
 * Team → MESSAGES: every conversation, newest first, with what is unread.
 *
 * Read once when shown; after that a message on the socket moves its row to
 * the top with the server's own count (shared chat/live.ts). Only a thread this
 * phone has never listed, or the app coming back, reads the list again.
 */
export function TeamMessages({ header }: { header: React.ReactElement }) {
  const {
    amazen,
    c,
    t,
    meId,
    tabSafe,
    list,
    error,
    refreshing,
    setRefreshing,
    query,
    setQuery,
    firstDraw,
    load,
    open,
    shown,
    found,
  } = useTeamMessages({ header });

  return (
    <FlatList
      data={shown ?? []}
      keyExtractor={(cv) => cv.id}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: amazen.space(4), paddingBottom: tabSafe }}
      initialNumToRender={14}
      windowSize={9}
      ListHeaderComponent={
        <>
          {header}
          <View style={{ marginBottom: amazen.space(3) }}>
            <GlassInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('chat.searchMessages', 'Search messages')}
              accessibilityLabel={t('chat.searchMessages', 'Search messages')}
              returnKeyType="search"
            />
          </View>
          {error ? <Banner tone="critical" text={error} /> : null}
        </>
      }
      ListFooterComponent={found}
      ListEmptyComponent={
        list === null ? (
          <LoadingLine onGlass padUnits={6} />
        ) : (
          <Well style={{ padding: amazen.space(6), alignItems: 'center', gap: amazen.space(2) }}>
            <InkIcon name="chat" size={40} />
            <AText variant="body" tone="strong">
              {t('chat.emptyTitle', 'No conversations yet')}
            </AText>
            <AText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
              {t('chat.emptyBody', 'Start one with anybody on your team.')}
            </AText>
          </Well>
        )
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={c.accent}
          colors={[c.accent]}
        />
      }
      renderItem={({ item, index }) => (
        <Arrive enabled={index < 12 && Date.now() - firstDraw.current < 1500} delay={Math.min(index, 12) * 35}>
          <ConversationRow
            conv={item}
            first={index === 0}
            last={index === (shown?.length ?? 0) - 1}
            mine={item.lastMessage?.senderId === meId}
            onOpen={open}
          />
        </Arrive>
      )}
    />
  );
}
