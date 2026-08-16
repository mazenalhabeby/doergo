import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator,
  Modal, ScrollView, Image, KeyboardAvoidingView, Platform, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/theme-context';
import { useSocketContext } from '../contexts/socket-context';
import { SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, COLORS } from '../lib/constants';
import { shiftIssuesApi, type ShiftIssue, type ShiftIssueEvent } from '../lib/api/shift-issues';
import { useImagePicker, type PickedImage } from '../hooks/useImagePicker';
import { uploadToPresignedUrl } from '../lib/api/attachments';

// Upload picked photos to S3 and return attachment metadata for a message/report.
async function uploadPhotos(issueId: string, photos: PickedImage[]): Promise<any[]> {
  const out: any[] = [];
  for (const p of photos) {
    try {
      const pre = await shiftIssuesApi.presignAttachment(issueId, p.fileName, p.mimeType);
      await uploadToPresignedUrl(pre.uploadUrl, p.uri, p.mimeType);
      out.push({ fileKey: pre.fileKey, fileUrl: pre.fileUrl, fileName: p.fileName, fileSize: p.fileSize, mimeType: p.mimeType, width: p.width, height: p.height });
    } catch { /* skip a failed photo, never lose the message */ }
  }
  return out;
}

const SEVERITIES: { key: string; label: string; color: string }[] = [
  { key: 'LOW', label: 'Low', color: '#64748b' },
  { key: 'MEDIUM', label: 'Medium', color: '#2563eb' },
  { key: 'HIGH', label: 'High', color: '#ea580c' },
  { key: 'URGENT', label: 'Urgent', color: '#dc2626' },
];
const RESOLVE_REASONS = ['Fixed on site', 'Parts not available', 'Needs a specialist', 'Customer unavailable', 'Duplicate', 'Not an issue'];
const fmt = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const sevColor = (k?: string) => SEVERITIES.find((s) => s.key === k)?.color ?? '#64748b';
const STATUS_LABEL: Record<string, string> = { OPEN: 'Open', ACKNOWLEDGED: 'Acknowledged', IN_PROGRESS: 'In progress', RESOLVED: 'Resolved', CLOSED: 'Closed', CANCELED: 'Canceled' };

/** List of the member's issues (managers see the org's) — tap one to open its thread. */
export function ShiftIssueListSheet({ visible, onClose, onOpen, onReport }: {
  visible: boolean; onClose: () => void; onOpen: (id: string) => void; onReport?: () => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { subscribe } = useSocketContext();
  const [issues, setIssues] = useState<ShiftIssue[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setIssues(await shiftIssuesApi.list({ status: 'all' })); } catch { /* noop */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (visible) load(); }, [visible, load]);
  useEffect(() => {
    if (!visible) return;
    const offs = [subscribe('shift_issue.event', () => load()), subscribe('shift_issue.created', () => load())];
    return () => offs.forEach((o) => o());
  }, [visible, subscribe, load]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.container}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + SPACING.md, maxHeight: '85%' }]}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Issues</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            {loading && issues.length === 0 ? (
              <ActivityIndicator style={{ marginVertical: SPACING.xl }} color={colors.textSecondary} />
            ) : issues.length === 0 ? (
              <Text style={[styles.hint, { color: colors.textMuted, textAlign: 'center', paddingVertical: SPACING.lg }]}>No issues yet.</Text>
            ) : issues.map((i) => (
              <TouchableOpacity key={i.id} activeOpacity={0.7} onPress={() => { onOpen(i.id); }}
                style={[styles.listRow, { borderColor: colors.border }]}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sevColor(i.severity), marginTop: 6 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: FONT_SIZE.base, fontWeight: '600', color: colors.textPrimary }} numberOfLines={1}>{i.title}</Text>
                  <Text style={{ fontSize: FONT_SIZE.xs, color: colors.textMuted, marginTop: 1 }}>
                    {STATUS_LABEL[i.status] ?? i.status} · {fmtDay(i.createdAt)}{i.eventCount ? ` · ${i.eventCount} updates` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </ScrollView>

          {onReport && (
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#dc2626', marginTop: SPACING.md }]} onPress={onReport}>
              <Ionicons name="warning-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.primaryBtnText}>Report an issue</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** Report a new blocker during a shift. */
export function ReportIssueSheet({ visible, onClose, timeEntryId, spaceId, onCreated }: {
  visible: boolean; onClose: () => void; timeEntryId?: string; spaceId?: string; onCreated: (id: string) => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { pickFromGallery, takePhoto } = useImagePicker();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('MEDIUM');
  const [picked, setPicked] = useState<PickedImage[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const issue = await shiftIssuesApi.create({ title: title.trim(), description: description.trim() || undefined, severity, timeEntryId, spaceId });
      // Photos are uploaded AFTER create (the S3 key needs the issue id) and
      // posted as the reporter's first message.
      if (picked.length) {
        const attachments = await uploadPhotos(issue.id, picked);
        if (attachments.length) { try { await shiftIssuesApi.message(issue.id, { body: '', attachments }); } catch { /* noop */ } }
      }
      setTitle(''); setDescription(''); setSeverity('MEDIUM'); setPicked([]);
      onCreated(issue.id);
    } catch {
      /* toast handled globally */
    } finally { setBusy(false); }
  }, [title, description, severity, timeEntryId, spaceId, picked, onCreated]);

  const addGallery = useCallback(async () => { const imgs = await pickFromGallery(); if (imgs.length) setPicked((p) => [...p, ...imgs].slice(0, 5)); }, [pickFromGallery]);
  const addCamera = useCallback(async () => { const img = await takePhoto(); if (img) setPicked((p) => [...p, img].slice(0, 5)); }, [takePhoto]);

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

          {picked.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.md }}>
              {picked.map((p, i) => (
                <View key={i} style={{ marginRight: SPACING.sm }}>
                  <Image source={{ uri: p.uri }} style={{ width: 56, height: 56, borderRadius: RADIUS.sm }} />
                  <TouchableOpacity style={styles.removeThumb} onPress={() => setPicked((prev) => prev.filter((_, idx) => idx !== i))}>
                    <Ionicons name="close-circle" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
          <View style={{ flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.md }}>
            <TouchableOpacity style={[styles.photoBtn, { borderColor: colors.border }]} onPress={addCamera} disabled={picked.length >= 5}>
              <Ionicons name="camera-outline" size={18} color={colors.textSecondary} /><Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm }}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.photoBtn, { borderColor: colors.border }]} onPress={addGallery} disabled={picked.length >= 5}>
              <Ionicons name="images-outline" size={18} color={colors.textSecondary} /><Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm }}>Photo</Text>
            </TouchableOpacity>
          </View>

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
  const { pickFromGallery, takePhoto } = useImagePicker();
  const [issue, setIssue] = useState<ShiftIssue | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [picked, setPicked] = useState<PickedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null); // full-screen image preview
  const [resolveOpen, setResolveOpen] = useState(false);
  const [reason, setReason] = useState('');
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
    if (!issueId || (!draft.trim() && picked.length === 0)) return;
    setBusy(true);
    try {
      const attachments = picked.length ? await uploadPhotos(issueId, picked) : [];
      await shiftIssuesApi.message(issueId, { body: draft.trim(), attachments });
      setDraft(''); setPicked([]); await load();
    } catch { /* noop */ } finally { setBusy(false); }
  }, [issueId, draft, picked, load]);

  const addGallery = useCallback(async () => { const imgs = await pickFromGallery(); if (imgs.length) setPicked((p) => [...p, ...imgs].slice(0, 5)); }, [pickFromGallery]);
  const addCamera = useCallback(async () => { const img = await takePhoto(); if (img) setPicked((p) => [...p, img].slice(0, 5)); }, [takePhoto]);

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
                  <TouchableOpacity style={[styles.actionBtn, { borderColor: colors.border }]} onPress={() => setResolveOpen((v) => !v)}>
                    <Ionicons name="checkmark-done" size={15} color={COLORS.success} /><Text style={[styles.actionText, { color: colors.textPrimary }]}>Resolve</Text>
                  </TouchableOpacity>
                </View>
              )}

              {canManage && !closed && resolveOpen && (
                <View style={[styles.resolvePanel, { borderColor: colors.border, backgroundColor: isDark ? colors.surfaceRaised : '#f8fafc' }]}>
                  <Text style={{ fontSize: FONT_SIZE.xs, fontWeight: '600', color: colors.textMuted, marginBottom: 6 }}>Reason (optional)</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {RESOLVE_REASONS.map((r) => (
                      <TouchableOpacity key={r} onPress={() => setReason(r)}
                        style={{ borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderColor: reason === r ? COLORS.primary : colors.border, backgroundColor: reason === r ? `${COLORS.primary}18` : 'transparent' }}>
                        <Text style={{ fontSize: FONT_SIZE.xs, color: reason === r ? COLORS.primary : colors.textSecondary }}>{r}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    style={{ borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.md, padding: SPACING.sm, fontSize: FONT_SIZE.sm, color: colors.textPrimary, minHeight: 40 }}
                    placeholder="Add a note / excuse…" placeholderTextColor={colors.textMuted}
                    value={reason} onChangeText={setReason} multiline
                  />
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.sm, marginTop: 8 }}>
                    <TouchableOpacity onPress={() => { setResolveOpen(false); setReason(''); }} style={{ paddingVertical: 6, paddingHorizontal: 12 }}>
                      <Text style={{ color: colors.textMuted, fontSize: FONT_SIZE.sm }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { const r = reason.trim(); setResolveOpen(false); setReason(''); act(() => shiftIssuesApi.setStatus(issue.id, 'RESOLVED', r || undefined)); }}
                      style={{ backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 6, paddingHorizontal: 14 }}>
                      <Text style={{ color: '#fff', fontSize: FONT_SIZE.sm, fontWeight: '600' }}>Resolve</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <ScrollView ref={scrollRef} style={{ maxHeight: 340 }} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled">
                {thread.map((e) => <ThreadItem key={e.id} e={e} mine={e.actorId === currentUserId} colors={colors} isDark={isDark} onOpenImage={setViewer} />)}
              </ScrollView>

              {!closed ? (
                <>
                  {picked.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: SPACING.sm }}>
                      {picked.map((p, i) => (
                        <View key={i} style={{ marginRight: SPACING.sm }}>
                          <Image source={{ uri: p.uri }} style={{ width: 48, height: 48, borderRadius: RADIUS.sm }} />
                          <TouchableOpacity style={styles.removeThumb} onPress={() => setPicked((prev) => prev.filter((_, idx) => idx !== i))}>
                            <Ionicons name="close-circle" size={16} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                  <View style={styles.composer}>
                    <TouchableOpacity style={styles.iconBtn} onPress={addCamera} disabled={picked.length >= 5}>
                      <Ionicons name="camera-outline" size={22} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconBtn} onPress={addGallery} disabled={picked.length >= 5}>
                      <Ionicons name="images-outline" size={22} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TextInput
                      style={[styles.msgInput, { backgroundColor: isDark ? colors.surfaceRaised : '#f1f5f9', color: colors.textPrimary }]}
                      placeholder="Message on this issue…" placeholderTextColor={colors.textMuted}
                      value={draft} onChangeText={setDraft} multiline maxLength={2000}
                    />
                    <TouchableOpacity style={[styles.sendBtn, (!draft.trim() && picked.length === 0) || busy ? { opacity: 0.5 } : null]} onPress={send} disabled={(!draft.trim() && picked.length === 0) || busy}>
                      {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <Text style={{ color: colors.textMuted, fontSize: FONT_SIZE.sm, textAlign: 'center', paddingVertical: SPACING.md }}>This issue is {issue.status.toLowerCase()}.</Text>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Full-screen image preview */}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)} statusBarTranslucent>
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewer(null)}>
          {viewer && <Image source={{ uri: viewer }} style={styles.viewerImage} resizeMode="contain" />}
          <TouchableOpacity style={[styles.viewerClose, { top: insets.top + SPACING.md }]} onPress={() => setViewer(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </Pressable>
      </Modal>
    </Modal>
  );
}

function ThreadItem({ e, mine, colors, isDark, onOpenImage }: { e: ShiftIssueEvent; mine: boolean; colors: any; isDark: boolean; onOpenImage: (uri: string) => void }) {
  if (e.type === 'MESSAGE') {
    return (
      <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: SPACING.sm }}>
        <View style={{ maxWidth: '80%', borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: mine ? COLORS.primary : (isDark ? colors.surfaceRaised : '#f1f5f9') }}>
          {!mine && <Text style={{ fontSize: FONT_SIZE.xs, fontWeight: '700', color: mine ? '#fff' : colors.textMuted, marginBottom: 2 }}>{e.actorName}</Text>}
          {!!e.body && <Text style={{ fontSize: FONT_SIZE.base, color: mine ? '#fff' : colors.textPrimary }}>{e.body}</Text>}
          {!!e.attachments?.length && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: e.body ? 6 : 0 }}>
              {e.attachments.filter((a) => (a.mimeType ?? '').startsWith('image/')).map((a, i) => (
                <TouchableOpacity key={i} activeOpacity={0.8} onPress={() => onOpenImage(a.url ?? a.fileUrl)}>
                  <Image source={{ uri: a.url ?? a.fileUrl }} style={{ width: 120, height: 120, borderRadius: RADIUS.md }} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
        <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>{fmt(e.at)}</Text>
      </View>
    );
  }
  const reasonSuffix = e.body ? ` — ${e.body}` : '';
  const label =
    e.type === 'CREATED' ? `${e.actorName} reported this issue` :
    e.type === 'ACKNOWLEDGED' ? `${e.actorName} acknowledged` :
    e.type === 'ASSIGNED' ? `Dispatched to ${e.metadata?.assignedToName ?? 'someone'}` :
    e.type === 'RESOLVED' ? `${e.actorName} marked it resolved${reasonSuffix}` :
    e.type === 'REOPENED' ? `${e.actorName} reopened it` :
    e.type === 'CLOSED' ? `${e.actorName} closed it${reasonSuffix}` : `${e.actorName} updated the issue${reasonSuffix}`;
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
  primaryBtn: { backgroundColor: '#dc2626', borderRadius: RADIUS.md, paddingVertical: SPACING.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, paddingVertical: SPACING.md, borderBottomWidth: 1 },
  primaryBtnText: { color: '#fff', fontWeight: FONT_WEIGHT.bold, fontSize: FONT_SIZE.base },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginBottom: SPACING.sm },
  actionRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  resolvePanel: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 6 },
  actionText: { fontSize: FONT_SIZE.sm, fontWeight: '600' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.xs, marginTop: SPACING.sm },
  msgInput: { flex: 1, borderRadius: RADIUS.md, padding: SPACING.md, fontSize: FONT_SIZE.base, minHeight: 44, maxHeight: 120 },
  sendBtn: { backgroundColor: COLORS.primary, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { padding: SPACING.sm, justifyContent: 'center' },
  photoBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: RADIUS.md, paddingVertical: SPACING.sm },
  removeThumb: { position: 'absolute', top: -6, right: -6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10 },
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  viewerClose: { position: 'absolute', right: SPACING.lg, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
});
