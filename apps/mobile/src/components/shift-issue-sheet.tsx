import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator,
  Modal, ScrollView, KeyboardAvoidingView, Platform, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/theme-context';
import { useSocketContext } from '../contexts/socket-context';
import { SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, COLORS } from '../lib/constants';
import { shiftIssuesApi, type ShiftIssue, type ShiftIssueEvent } from '../lib/api/shift-issues';

const SEVERITIES: { key: string; label: string; color: string }[] = [
  { key: 'LOW', label: 'Low', color: '#64748b' },
  { key: 'MEDIUM', label: 'Medium', color: '#2563eb' },
  { key: 'HIGH', label: 'High', color: '#ea580c' },
  { key: 'URGENT', label: 'Urgent', color: '#dc2626' },
];
const fmt = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** Report a new blocker during a shift. */
export function ReportIssueSheet({ visible, onClose, timeEntryId, spaceId, onCreated }: {
  visible: boolean; onClose: () => void; timeEntryId?: string; spaceId?: string; onCreated: (id: string) => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('MEDIUM');
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const issue = await shiftIssuesApi.create({ title: title.trim(), description: description.trim() || undefined, severity, timeEntryId, spaceId });
      setTitle(''); setDescription(''); setSeverity('MEDIUM');
      onCreated(issue.id);
    } catch {
      /* toast handled globally */
    } finally { setBusy(false); }
  }, [title, description, severity, timeEntryId, spaceId, onCreated]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + SPACING.md }]}>
          <View style={styles.handle} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>Report an issue</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>Hit a blocker you can't fix? Report it — your responsible person is notified right away.</Text>

          <TextInput
            style={[styles.input, { backgroundColor: isDark ? colors.surfaceRaised : '#f1f5f9', color: colors.textPrimary }]}
            placeholder="What's the problem? (short title)" placeholderTextColor={colors.textMuted}
            value={title} onChangeText={setTitle} maxLength={200}
          />
          <View style={styles.sevRow}>
            {SEVERITIES.map((s) => (
              <TouchableOpacity key={s.key} onPress={() => setSeverity(s.key)}
                style={[styles.sevChip, { borderColor: severity === s.key ? s.color : colors.border, backgroundColor: severity === s.key ? `${s.color}22` : 'transparent' }]}>
                <Text style={{ color: severity === s.key ? s.color : colors.textSecondary, fontWeight: '600', fontSize: FONT_SIZE.sm }}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={[styles.input, { height: 90, textAlignVertical: 'top', backgroundColor: isDark ? colors.surfaceRaised : '#f1f5f9', color: colors.textPrimary }]}
            placeholder="Describe what's happening (optional)" placeholderTextColor={colors.textMuted}
            value={description} onChangeText={setDescription} multiline maxLength={2000}
          />
          <TouchableOpacity style={[styles.primaryBtn, (!title.trim() || busy) && { opacity: 0.5 }]} onPress={submit} disabled={!title.trim() || busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Report issue</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Live thread for one issue — chat + system events + status actions. */
export function ShiftIssueThreadSheet({ visible, onClose, issueId, canManage, currentUserId }: {
  visible: boolean; onClose: () => void; issueId: string | null; canManage?: boolean; currentUserId?: string;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { subscribe } = useSocketContext();
  const [issue, setIssue] = useState<ShiftIssue | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!issueId) return;
    setLoading(true);
    try { setIssue(await shiftIssuesApi.get(issueId)); } catch { /* noop */ } finally { setLoading(false); }
  }, [issueId]);

  useEffect(() => { if (visible && issueId) load(); }, [visible, issueId, load]);

  // Live: refresh the thread on any socket event for this issue.
  useEffect(() => {
    if (!visible || !issueId) return;
    const handler = (d: any) => { if (d?.issueId === issueId) load(); };
    const offs = [subscribe('shift_issue.event', handler), subscribe('shift_issue.created', handler)];
    return () => offs.forEach((o) => o());
  }, [visible, issueId, subscribe, load]);

  const send = useCallback(async () => {
    if (!issueId || !draft.trim()) return;
    setBusy(true);
    try { await shiftIssuesApi.message(issueId, { body: draft.trim() }); setDraft(''); await load(); }
    catch { /* noop */ } finally { setBusy(false); }
  }, [issueId, draft, load]);

  const act = useCallback(async (fn: () => Promise<any>) => { try { await fn(); await load(); } catch { /* noop */ } }, [load]);

  const thread = issue?.thread ?? [];
  const closed = issue ? ['RESOLVED', 'CLOSED', 'CANCELED'].includes(issue.status) : false;
  const sev = SEVERITIES.find((s) => s.key === issue?.severity);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + SPACING.md, maxHeight: '88%' }]}>
          <View style={styles.handle} />
          {loading && !issue ? (
            <ActivityIndicator style={{ marginVertical: SPACING.xl }} color={colors.textSecondary} />
          ) : !issue ? (
            <Text style={[styles.hint, { color: colors.textMuted, textAlign: 'center' }]}>Issue not found.</Text>
          ) : (
            <>
              <View style={styles.headerRow}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <View style={{ backgroundColor: `${sev?.color}22`, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                      <Text style={{ color: sev?.color, fontSize: FONT_SIZE.xs, fontWeight: '700' }}>{sev?.label}</Text>
                    </View>
                    <Text style={{ color: colors.textMuted, fontSize: FONT_SIZE.xs, fontWeight: '600' }}>{issue.status.replace('_', ' ')}</Text>
                  </View>
                  <Text style={[styles.title, { color: colors.textPrimary, fontSize: FONT_SIZE.lg }]} numberOfLines={2}>{issue.title}</Text>
                  {!!issue.assigneeName && <Text style={{ color: colors.textMuted, fontSize: FONT_SIZE.xs }}>Dispatched to {issue.assigneeName}</Text>}
                </View>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {canManage && !closed && (
                <View style={styles.actionRow}>
                  {issue.status === 'OPEN' && (
                    <TouchableOpacity style={[styles.actionBtn, { borderColor: colors.border }]} onPress={() => act(() => shiftIssuesApi.acknowledge(issue.id))}>
                      <Ionicons name="checkmark" size={15} color={COLORS.primary} /><Text style={[styles.actionText, { color: colors.textPrimary }]}>Acknowledge</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[styles.actionBtn, { borderColor: colors.border }]} onPress={() => act(() => shiftIssuesApi.setStatus(issue.id, 'RESOLVED'))}>
                    <Ionicons name="checkmark-done" size={15} color={COLORS.success} /><Text style={[styles.actionText, { color: colors.textPrimary }]}>Resolve</Text>
                  </TouchableOpacity>
                </View>
              )}

              <ScrollView ref={scrollRef} style={{ maxHeight: 340 }} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled">
                {thread.map((e) => <ThreadItem key={e.id} e={e} mine={e.actorId === currentUserId} colors={colors} isDark={isDark} />)}
              </ScrollView>

              {!closed ? (
                <View style={styles.composer}>
                  <TextInput
                    style={[styles.msgInput, { backgroundColor: isDark ? colors.surfaceRaised : '#f1f5f9', color: colors.textPrimary }]}
                    placeholder="Message on this issue…" placeholderTextColor={colors.textMuted}
                    value={draft} onChangeText={setDraft} multiline maxLength={2000}
                  />
                  <TouchableOpacity style={[styles.sendBtn, (!draft.trim() || busy) && { opacity: 0.5 }]} onPress={send} disabled={!draft.trim() || busy}>
                    {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={{ color: colors.textMuted, fontSize: FONT_SIZE.sm, textAlign: 'center', paddingVertical: SPACING.md }}>This issue is {issue.status.toLowerCase()}.</Text>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ThreadItem({ e, mine, colors, isDark }: { e: ShiftIssueEvent; mine: boolean; colors: any; isDark: boolean }) {
  if (e.type === 'MESSAGE') {
    return (
      <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: SPACING.sm }}>
        <View style={{ maxWidth: '80%', borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: mine ? COLORS.primary : (isDark ? colors.surfaceRaised : '#f1f5f9') }}>
          {!mine && <Text style={{ fontSize: FONT_SIZE.xs, fontWeight: '700', color: mine ? '#fff' : colors.textMuted, marginBottom: 2 }}>{e.actorName}</Text>}
          <Text style={{ fontSize: FONT_SIZE.base, color: mine ? '#fff' : colors.textPrimary }}>{e.body}</Text>
        </View>
        <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>{fmt(e.at)}</Text>
      </View>
    );
  }
  const label =
    e.type === 'CREATED' ? `${e.actorName} reported this issue` :
    e.type === 'ACKNOWLEDGED' ? `${e.actorName} acknowledged` :
    e.type === 'ASSIGNED' ? `Dispatched to ${e.metadata?.assignedToName ?? 'someone'}` :
    e.type === 'RESOLVED' ? `${e.actorName} marked it resolved` :
    e.type === 'REOPENED' ? `${e.actorName} reopened it` :
    e.type === 'CLOSED' ? `${e.actorName} closed it` : `${e.actorName} updated the issue`;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 4 }}>
      <Ionicons name="ellipse" size={5} color={colors.textMuted} />
      <Text style={{ fontSize: FONT_SIZE.xs, color: colors.textMuted }}>{label} · {fmt(e.at)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.xl, maxHeight: '85%' },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#9ca3af', marginBottom: SPACING.md },
  title: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold },
  hint: { fontSize: FONT_SIZE.sm, marginTop: SPACING.xs, marginBottom: SPACING.md },
  input: { borderRadius: RADIUS.md, padding: SPACING.md, fontSize: FONT_SIZE.base, marginBottom: SPACING.md },
  sevRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  sevChip: { flex: 1, alignItems: 'center', borderWidth: 1.5, borderRadius: RADIUS.md, paddingVertical: SPACING.sm },
  primaryBtn: { backgroundColor: '#dc2626', borderRadius: RADIUS.md, paddingVertical: SPACING.md, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: FONT_WEIGHT.bold, fontSize: FONT_SIZE.base },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginBottom: SPACING.sm },
  actionRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 6 },
  actionText: { fontSize: FONT_SIZE.sm, fontWeight: '600' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm, marginTop: SPACING.sm },
  msgInput: { flex: 1, borderRadius: RADIUS.md, padding: SPACING.md, fontSize: FONT_SIZE.base, minHeight: 44, maxHeight: 120 },
  sendBtn: { backgroundColor: COLORS.primary, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
