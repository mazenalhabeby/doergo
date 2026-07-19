import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { SocketEvents, type SupportTicket } from '@hbcfield/shared/client';
import { useTheme } from '../../src/contexts/theme-context';
import { useSocketContext } from '../../src/contexts/socket-context';
import { ScreenContainer } from '../../src/components';
import { supportApi, type SupportConfig } from '../../src/lib/api';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../src/lib/constants';

type SupportView = 'list' | 'new' | 'thread';

export default function SupportScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { subscribe } = useSocketContext();
  const params = useLocalSearchParams<{ ticketId?: string }>();

  const [view, setView] = useState<SupportView>('list');
  const [config, setConfig] = useState<SupportConfig | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [active, setActive] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [agentOnline, setAgentOnline] = useState(false);

  // New ticket
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const liveChat = !!config?.liveChat;

  const loadList = useCallback(async () => {
    try {
      const [cfg, list] = await Promise.all([supportApi.getConfig(), supportApi.list()]);
      setConfig(cfg);
      setTickets(list.data);
    } finally {
      setLoading(false);
    }
  }, []);

  const openTicket = useCallback(async (id: string) => {
    const tk = await supportApi.get(id);
    setActive(tk);
    setView('thread');
    supportApi.markRead(id).catch(() => {});
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Deep-link from a push tap (?ticketId=…)
  useEffect(() => {
    if (params.ticketId) openTicket(String(params.ticketId));
  }, [params.ticketId, openTicket]);

  // Real-time refresh.
  useEffect(() => {
    const offs = [
      subscribe(SocketEvents.SUPPORT_MESSAGE, (d: any) => {
        loadList();
        if (active && d?.ticketId === active.id) supportApi.get(active.id).then(setActive);
      }),
      subscribe(SocketEvents.SUPPORT_TICKET_UPDATED, () => loadList()),
      subscribe(SocketEvents.SUPPORT_AGENT_PRESENCE, (d: any) => setAgentOnline(!!d?.online)),
    ];
    return () => offs.forEach((o) => o());
  }, [subscribe, active, loadList]);

  const submitNew = async () => {
    if (subject.trim().length < 2 || body.trim().length < 1) return;
    setSending(true);
    try {
      const tk = await supportApi.create({ subject: subject.trim(), body: body.trim() });
      setSubject('');
      setBody('');
      await loadList();
      openTicket(tk.id);
    } finally {
      setSending(false);
    }
  };

  const submitReply = async () => {
    if (!active || !reply.trim()) return;
    setSending(true);
    try {
      await supportApi.reply(active.id, reply.trim());
      setReply('');
      const tk = await supportApi.get(active.id);
      setActive(tk);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    } finally {
      setSending(false);
    }
  };

  const headerTitle =
    view === 'new' ? t('support.newTicket', 'New request') : view === 'thread' ? active?.subject || t('support.title', 'Support') : t('support.title', 'Support');

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderColor: colors.border }]}>
        {view !== 'list' ? (
          <TouchableOpacity onPress={() => setView('list')} style={styles.back}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.back} />
        )}
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {headerTitle}
        </Text>
        <View style={styles.back} />
      </View>

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
          <ScrollView style={{ flex: 1 }}>
            {tickets.length === 0 ? (
              <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('support.empty', 'No tickets yet.')}</Text>
            ) : (
              tickets.map((tk) => (
                <TouchableOpacity
                  key={tk.id}
                  onPress={() => openTicket(tk.id)}
                  style={[styles.ticketRow, { borderColor: colors.border }]}
                >
                  <View style={[styles.dot, { backgroundColor: ['OPEN', 'PENDING_AGENT', 'PENDING_CUSTOMER'].includes(tk.status) ? COLORS.primary : colors.border }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.ticketSubject, { color: colors.textPrimary }]} numberOfLines={1}>{tk.subject}</Text>
                    <Text style={[styles.ticketMeta, { color: colors.textSecondary }]}>{t(`support.status.${tk.status}`, tk.status)}</Text>
                  </View>
                  {!!tk.unreadForCustomer && <View style={styles.badge}><Text style={styles.badgeText}>{tk.unreadForCustomer}</Text></View>}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setView('new')}>
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
          <TouchableOpacity style={[styles.primaryBtn, sending && { opacity: 0.6 }]} disabled={sending} onPress={submitNew}>
            <Text style={styles.primaryBtnText}>{sending ? '…' : t('support.send', 'Send')}</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView ref={scrollRef} style={{ flex: 1, padding: SPACING.md }}>
            {active?.messages?.map((m) => {
              const mine = m.authorType === 'CUSTOMER';
              return (
                <View key={m.id} style={[styles.bubbleRow, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
                  <View style={[styles.bubble, mine ? { backgroundColor: COLORS.primary } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
                    <Text style={{ color: mine ? '#fff' : colors.textPrimary, fontSize: FONT_SIZE.sm }}>{m.body}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
          <View style={[styles.replyBar, { borderColor: colors.border }]}>
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
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1 },
  back: { width: 36, height: 36, justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  slaRow: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  empty: { textAlign: 'center', marginTop: 40, fontSize: FONT_SIZE.sm },
  ticketRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, borderBottomWidth: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  ticketSubject: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.medium },
  ticketMeta: { fontSize: FONT_SIZE.xs, marginTop: 2 },
  badge: { backgroundColor: COLORS.primary, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: FONT_WEIGHT.bold },
  primaryBtn: { backgroundColor: COLORS.primary, margin: SPACING.md, borderRadius: RADIUS.md, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: FONT_WEIGHT.semibold, fontSize: FONT_SIZE.md },
  input: { borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: FONT_SIZE.md, marginBottom: SPACING.md },
  textarea: { minHeight: 140, textAlignVertical: 'top' },
  bubbleRow: { flexDirection: 'row', marginBottom: SPACING.sm },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  replyBar: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm, padding: SPACING.sm, borderTopWidth: 1 },
  replyInput: { flex: 1, borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 8, maxHeight: 100, fontSize: FONT_SIZE.sm },
  sendBtn: { backgroundColor: COLORS.primary, width: 40, height: 40, borderRadius: RADIUS.md, justifyContent: 'center', alignItems: 'center' },
});
