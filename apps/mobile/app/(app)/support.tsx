import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SocketEvents, type SupportTicket } from '@hbcfield/shared/client';
import { useTheme } from '../../src/contexts/theme-context';
import { useSocketContext } from '../../src/contexts/socket-context';
import { ScreenContainer, ScreenHeader, goBack as leaveScreen } from '../../src/components';
import { supportApi, type SupportConfig } from '../../src/lib/api';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../src/lib/constants';
import { useQueuedCreate } from '../../src/offline/actions/queued-create';

type SupportView = 'list' | 'new' | 'thread';

export default function SupportScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { subscribe, isAuthenticated } = useSocketContext();
  const params = useLocalSearchParams<{ ticketId?: string }>();
  const insets = useSafeAreaInsets();
  // Keep the bottom action clear of the Android nav bar / home indicator.
  const bottomPad = Math.max(insets.bottom, SPACING.sm);

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
  const [error, setError] = useState<string | null>(null);

  // Requests and replies written with no signal wait in the outbox and show here meanwhile.
  const ticketCreate = useQueuedCreate<{ subject: string; body: string }>('support.ticket', { onAccepted: () => void loadListRef.current?.() });
  const replyCreate = useQueuedCreate<{ body: string }>('support.message', {
    onAccepted: () => {
      const open = activeRef.current;
      if (open) void supportApi.get(open.id).then(setActive).catch(() => undefined);
    },
  });
  const loadListRef = useRef<(() => Promise<void>) | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const liveChat = !!config?.liveChat;

  const loadList = useCallback(async () => {
    // Settle independently — a hiccup on one call shouldn't blank the whole screen.
    const [cfgR, listR] = await Promise.allSettled([supportApi.getConfig(), supportApi.list()]);
    if (cfgR.status === 'fulfilled') setConfig(cfgR.value);
    // `list` resolves to the array itself — fetchWithAuth already unwrapped
    // the envelope. Guarded anyway: a screen must not crash on a bad payload.
    if (listR.status === 'fulfilled') setTickets(listR.value ?? []);
    // Only surface an error if BOTH failed (a real connectivity problem).
    setError(cfgR.status === 'rejected' && listR.status === 'rejected'
      ? t('support.loadError', 'Could not load support. Check your connection.')
      : null);
    setLoading(false);
  }, [t]);

  const openTicket = useCallback(async (id: string) => {
    try {
      const tk = await supportApi.get(id);
      setActive(tk);
      setView('thread');
      setError(null);
      supportApi.markRead(id).catch(() => {});
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    } catch {
      setError(t('support.loadError', 'Could not load support. Check your connection.'));
    }
  }, [t]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Deep-link from a push tap (?ticketId=…)
  useEffect(() => {
    if (params.ticketId) openTicket(String(params.ticketId));
  }, [params.ticketId, openTicket]);

  // Real-time refresh. Reads the open ticket via a ref so a new message doesn't
  // re-subscribe the listeners on every render.
  const activeRef = useRef(active);
  activeRef.current = active;
  loadListRef.current = loadList;

  const shownTickets = useMemo(() => {
    const known = new Set(tickets.map((tk) => tk.id));
    const onPhone = ticketCreate.pending
      .filter((p) => !known.has(p.id))
      .map((p) => ({ id: p.id, subject: p.body.subject, status: 'OPEN', pendingSync: true }) as unknown as SupportTicket);
    return [...onPhone, ...tickets];
  }, [tickets, ticketCreate.pending]);

  const shownMessages = useMemo(() => {
    if (!active) return [];
    const server = active.messages ?? [];
    const known = new Set(server.map((m) => m.id));
    const onPhone = replyCreate.pending
      .filter((p) => p.params.ticketId === active.id && !known.has(p.id))
      .map((p) => ({ id: p.id, authorType: 'CUSTOMER', body: p.body.body, pendingSync: true }) as unknown as NonNullable<SupportTicket['messages']>[number]);
    return [...server, ...onPhone];
  }, [active, replyCreate.pending]);
  useEffect(() => {
    if (!isAuthenticated) return;
    const offs = [
      subscribe(SocketEvents.SUPPORT_MESSAGE, (d: any) => {
        loadList();
        const open = activeRef.current;
        if (open && d?.ticketId === open.id) supportApi.get(open.id).then(setActive).catch(() => {});
      }),
      subscribe(SocketEvents.SUPPORT_TICKET_UPDATED, () => loadList()),
      subscribe(SocketEvents.SUPPORT_AGENT_PRESENCE, (d: any) => setAgentOnline(!!d?.online)),
    ];
    return () => offs.forEach((o) => o());
  }, [isAuthenticated, subscribe, loadList]);

  const submitNew = async () => {
    if (subject.trim().length < 2 || body.trim().length < 1) return;
    setSending(true);
    try {
      const input = { subject: subject.trim(), body: body.trim(), channel: 'MOBILE' };
      const outcome = await ticketCreate.run({ lane: 'support:new', body: input }, () => supportApi.create({ subject: input.subject, body: input.body }));
      if (outcome.kind === 'refused') {
        setError((outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) || outcome.message || t('support.sendError', 'Could not send. Please try again.'));
        return;
      }
      setSubject('');
      setBody('');
      setError(null);
      if (outcome.kind === 'queued') {
        // Not with support yet: back to the list, where it waits as "sending".
        setView('list');
        return;
      }
      await loadList();
      openTicket((outcome.response as { id: string }).id);
    } catch {
      setError(t('support.sendError', 'Could not send. Please try again.'));
    } finally {
      setSending(false);
    }
  };

  const submitReply = async () => {
    if (!active || !reply.trim()) return;
    setSending(true);
    try {
      const text = reply.trim();
      const outcome = await replyCreate.run(
        { lane: `support:${active.id}`, params: { ticketId: active.id }, body: { body: text } },
        () => supportApi.reply(active.id, text),
      );
      if (outcome.kind === 'refused') {
        setError((outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) || outcome.message || t('support.sendError', 'Could not send. Please try again.'));
        return;
      }
      setReply('');
      setError(null);
      if (outcome.kind === 'done') setActive(await supportApi.get(active.id));
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    } catch {
      setError(t('support.sendError', 'Could not send. Please try again.'));
    } finally {
      setSending(false);
    }
  };

  /*
    Out of the screen, or back a step inside it.

    ⚠️ The chevron used to exist ONLY on the `new` and `thread` views, where it
    meant "back to the list". On the list itself it was an empty 36px spacer —
    so arriving here from the home screen left no way out at all: this is a
    pushed Stack screen (`headerShown: false`), so there is no navigator header
    and no tab bar either. The iOS swipe-back gesture was the only exit, and
    nothing on screen said so.

    `canGoBack()` because Support is also reachable from a push notification
    (see (app)/_layout.tsx), which can open it with no history behind it — the
    same guard chat.tsx already uses.
  */
  const goBack = () => {
    if (view !== 'list') { setView('list'); return; }
    leaveScreen();
  };

  const headerTitle =
    view === 'new' ? t('support.newTicket', 'New request') : view === 'thread' ? active?.subject || t('support.title', 'Support') : t('support.title', 'Support');

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
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: SPACING.sm }}>
            {shownTickets.length === 0 ? (
              <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('support.empty', 'No tickets yet.')}</Text>
            ) : (
              shownTickets.map((tk) => (
                <TouchableOpacity
                  key={tk.id}
                  // A request still on the phone has no thread on the server to open yet.
                  disabled={!!(tk as { pendingSync?: boolean }).pendingSync}
                  onPress={() => openTicket(tk.id)}
                  style={[styles.ticketRow, { borderColor: colors.border }]}
                >
                  <View style={[styles.dot, { backgroundColor: ['OPEN', 'PENDING_AGENT', 'PENDING_CUSTOMER'].includes(tk.status) ? COLORS.primary : colors.border }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.ticketSubject, { color: colors.textPrimary }]} numberOfLines={1}>{tk.subject}</Text>
                    <Text style={[styles.ticketMeta, { color: colors.textSecondary }]}>
                      {(tk as { pendingSync?: boolean }).pendingSync ? t('offline.chip.waiting') : t(`support.status.${tk.status}`, tk.status)}
                    </Text>
                  </View>
                  {!!tk.unreadForCustomer && <View style={styles.badge}><Text style={styles.badgeText}>{tk.unreadForCustomer}</Text></View>}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
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
          <TouchableOpacity style={[styles.primaryBtn, { marginBottom: SPACING.md + bottomPad }, sending && { opacity: 0.6 }]} disabled={sending} onPress={submitNew}>
            <Text style={styles.primaryBtnText}>{sending ? '…' : t('support.send', 'Send')}</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: SPACING.md, paddingBottom: SPACING.sm }}
          >
            {shownMessages.map((m) => {
              const mine = m.authorType === 'CUSTOMER';
              const pending = !!(m as { pendingSync?: boolean }).pendingSync;
              return (
                <View key={m.id} style={[styles.bubbleRow, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
                  <View style={[styles.bubble, mine ? { backgroundColor: COLORS.primary } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }, pending && { opacity: 0.7 }]}>
                    <Text style={{ color: mine ? '#fff' : colors.textPrimary, fontSize: FONT_SIZE.sm }}>{m.body}</Text>
                    {pending && <Ionicons name="time-outline" size={11} color="#fff" style={{ alignSelf: 'flex-end', marginTop: 2 }} accessibilityLabel={t('offline.chip.waiting')} />}
                  </View>
                </View>
              );
            })}
          </ScrollView>
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  slaRow: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  errorBar: { backgroundColor: '#FEE2E2', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  errorText: { color: '#B91C1C', fontSize: FONT_SIZE.sm },
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
