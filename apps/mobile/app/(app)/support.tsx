import { memo, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SocketEvents, type SupportTicket } from '@hbcfield/shared/client';
import { appendMessage, debounce, isPlaceable } from '../../src/components/chat/live-thread';
import { useAppResume } from '../../src/lib/app-resume';
import { useTheme } from '../../src/contexts/theme-context';
import { useSocketContext } from '../../src/contexts/socket-context';
import { ScreenContainer, ScreenHeader, goBack as leaveScreen } from '../../src/components';
import { supportApi, type SupportConfig } from '../../src/lib/api';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../src/lib/constants';
import { useQueuedCreate } from '../../src/offline/actions/queued-create';
import { useSupportScreen } from '../../src/screens/app/use-support-screen';
import { TicketRow, SupportBubble, styles } from '../../src/screens/app/support-screen-helpers';

export default function SupportScreen() {
  const {
    t,
    colors,
    insets,
    bottomPad,
    view,
    setView,
    config,
    loading,
    agentOnline,
    subject,
    setSubject,
    body,
    setBody,
    reply,
    setReply,
    sending,
    error,
    liveChat,
    openTicket,
    shownTickets,
    reversedMessages,
    submitNew,
    submitReply,
    goBack,
    headerTitle,
  } = useSupportScreen();

  return (
    /*
      ⚠️ The screen owns its own safe area. `headerShown: false` for this route
      (see (app)/_layout.tsx), so the header below IS the header — and nothing
      was clearing the status bar, which put the title and the back chevron
      under the notch on every one of the three views.

      The root also has to PAINT the background: ScreenContainer only caps the
      width, so an unpainted strip behind the status bar shows whatever the
      navigator is drawing underneath. Same shape as documents.tsx.
    */
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
    <ScreenContainer>
      <ScreenHeader
        title={headerTitle}
        /* Inside the screen this steps back a view; on the list it leaves. */
        onBack={goBack}
      />

      {error ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : view === 'list' ? (
        <>
          <View style={styles.slaRow}>
            {liveChat ? (
              <Text style={{ color: agentOnline ? COLORS.success : colors.textSecondary, fontSize: FONT_SIZE.sm }}>
                {agentOnline ? t('support.agentOnline', 'Live chat — agent online') : t('support.leaveMessage', 'Leave a message')}
              </Text>
            ) : (
              <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm }}>
                {config ? `${t('support.typicalReply', 'Typical reply within')} ${Math.round(config.slaBusinessMinutes / 60)}h` : ''}
              </Text>
            )}
          </View>
          <FlatList
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: SPACING.sm }}
            data={shownTickets}
            keyExtractor={(tk) => tk.id}
            initialNumToRender={14}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                {t('support.empty', 'No tickets yet.')}
              </Text>
            }
            renderItem={({ item }) => <TicketRow ticket={item} onOpen={openTicket} />}
          />
          <TouchableOpacity style={[styles.primaryBtn, { marginBottom: SPACING.md + bottomPad }]} onPress={() => setView('new')}>
            <Text style={styles.primaryBtnText}>{t('support.newTicket', 'New request')}</Text>
          </TouchableOpacity>
        </>
      ) : view === 'new' ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, padding: SPACING.md }}>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder={t('support.subjectPlaceholder', 'Subject')}
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
          />
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={t('support.bodyPlaceholder', 'How can we help?')}
            placeholderTextColor={colors.textSecondary}
            multiline
            style={[styles.input, styles.textarea, { color: colors.textPrimary, borderColor: colors.border }]}
          />
          <TouchableOpacity
            style={[styles.primaryBtn, { marginBottom: SPACING.md + bottomPad }, sending && { opacity: 0.6 }]}
            disabled={sending}
            onPress={submitNew}>
            <Text style={styles.primaryBtnText}>{sending ? '…' : t('support.send', 'Send')}</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          {/* Inverted: the newest at the bottom, in view without scrolling; only what is on screen is drawn. */}
          <FlatList
            inverted
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: SPACING.md, paddingBottom: SPACING.sm }}
            data={reversedMessages}
            keyExtractor={(m) => m.id}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={20}
            renderItem={({ item }) => (
              <SupportBubble
                body={item.body}
                mine={item.authorType === 'CUSTOMER'}
                pending={!!(item as { pendingSync?: boolean }).pendingSync}
              />
            )}
          />
          <View style={[styles.replyBar, { borderColor: colors.border, paddingBottom: SPACING.sm + bottomPad }]}>
            <TextInput
              value={reply}
              onChangeText={setReply}
              placeholder={t('support.replyPlaceholder', 'Write a reply…')}
              placeholderTextColor={colors.textSecondary}
              style={[styles.replyInput, { color: colors.textPrimary, borderColor: colors.border }]}
              multiline
            />
            <TouchableOpacity style={styles.sendBtn} disabled={sending || !reply.trim()} onPress={submitReply}>
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </ScreenContainer>
    </View>
  );
}
