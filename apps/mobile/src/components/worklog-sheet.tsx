import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  ScrollView,
  Image,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/theme-context';
import { useToast } from '../contexts/toast-context';
import { SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, COLORS } from '../lib/constants';
import { useImagePicker, type PickedImage } from '../hooks/useImagePicker';
import { BlurSheet } from './blur-sheet';
import { SheetPanel } from './sheet-panel';
import { worklogApi, type WorkLogNote } from '../lib/api/worklog';
import { uploadToPresignedUrl } from '../lib/api/attachments';
import { useOffline, useSyncStatus } from '../offline/offline-context';
import { addWorklogEntry, loadWorklog, worklogView, type WorklogItem } from '../offline/attendance/worklog';
import { adoptLegacyQueue, flushLegacy, queueLegacy, readLegacy } from '../offline/attendance/legacy-worklog-queue';

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const isImg = (m: string) => m.startsWith('image/');

interface Props {
  visible: boolean;
  onClose: () => void;
  timeEntryId: string;
  title: string;
  hint: string;
  /** Only the active (clocked-in) session can be edited; a closed session is read-only. */
  editable?: boolean;
}

/**
 * Session work-log sheet: timestamped notes (+ photos) during a shift.
 *
 * With the offline layer a note goes into the outbox with the id it will have
 * on the server, its photos kept on the phone and uploaded when it is sent —
 * so it works with no signal and is never written twice. The list is the
 * server's notes (or the phone's saved copy of them) with everything still on
 * its way laid on top.
 *
 * On a build without the offline layer the old queue is used, as before.
 */
export function WorkLogSheet({ visible, onClose, timeEntryId, title, hint, editable = true }: Props) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { pickFromGallery, takePhoto } = useImagePicker();
  const offline = useOffline();
  const { operations } = useSyncStatus();
  const outbox = offline.engine && offline.files ? { engine: offline.engine, files: offline.files } : null;

  const [serverNotes, setServerNotes] = useState<WorkLogNote[]>([]);
  const [legacyPending, setLegacyPending] = useState<WorklogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [picked, setPicked] = useState<PickedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null); // full-screen image preview

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (outbox) await adoptLegacyQueue(outbox.engine, outbox.files, timeEntryId);
      else await flushLegacy(timeEntryId);
      setServerNotes(await loadWorklog(timeEntryId, offline.records));
    } catch {
      /* leave whatever we have */
    } finally {
      if (!outbox) {
        // The old queue's items, shown in the same shape so nothing looks lost.
        const items = await readLegacy(timeEntryId);
        setLegacyPending(items.map((i) => ({
          id: i.id, timeEntryId, body: i.body, at: i.at, pendingSync: true,
          attachments: (i.photos ?? []).map((ph, n) => ({ id: `${i.id}_${n}`, fileName: ph.fileName, mimeType: ph.mimeType, fileUrl: ph.uri, url: ph.uri })),
        }) as unknown as WorklogItem));
      }
      setLoading(false);
    }
  }, [timeEntryId, offline.records, outbox?.engine, outbox?.files]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  // A note or photo from this session accepted in the background: show the server's copy.
  const accepted = useRef(new Set<string>());
  useEffect(() => {
    if (!visible) return;
    let fresh = false;
    for (const o of operations) {
      if (!o.op.startsWith('worklog.') || o.entityId !== timeEntryId || o.state !== 'done' || accepted.current.has(o.id)) continue;
      accepted.current.add(o.id);
      fresh = true;
    }
    if (fresh) void loadWorklog(timeEntryId, offline.records).then(setServerNotes).catch(() => undefined);
  }, [operations, visible, timeEntryId, offline.records]);

  const notes: WorklogItem[] = useMemo(
    () =>
      outbox
        ? worklogView(serverNotes, timeEntryId, operations, (id, mime) => outbox.files.uriFor(id, mime))
        : [...serverNotes, ...legacyPending],
    [outbox?.files, serverNotes, legacyPending, operations, timeEntryId],
  );

  const add = useCallback(async () => {
    const body = draft.trim() || '(photo)';
    if (!draft.trim() && picked.length === 0) return;
    setBusy(true);
    try {
      if (outbox) {
        const { outcome } = await addWorklogEntry(outbox.engine, outbox.files, {
          entryId: timeEntryId,
          body,
          photos: picked.map((p) => ({ uri: p.uri, fileName: p.fileName, mimeType: p.mimeType, width: p.width, height: p.height })),
        });
        if (outcome.kind === 'refused') {
          toast.error(t('common.error'), (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) || outcome.message || t('common.error'));
          return;
        }
      } else {
        await legacyAdd(timeEntryId, body, picked);
      }
      setDraft('');
      setPicked([]);
    } catch {
      toast.error(t('common.error'), t('offline.errors.PHOTO_NOT_KEPT'));
    } finally {
      setBusy(false);
      if (!outbox) load();
    }
  }, [draft, picked, timeEntryId, outbox?.engine, outbox?.files, load, t, toast]);

  const remove = useCallback(async (id: string) => {
    setServerNotes((p) => p.filter((n) => n.id !== id));
    try { await worklogApi.deleteNote(id); } catch { load(); }
  }, [load]);

  const addFromGallery = useCallback(async () => {
    const imgs = await pickFromGallery('worklog-photo');
    if (imgs.length) setPicked((p) => [...p, ...imgs].slice(0, 5));
  }, [pickFromGallery]);

  const addFromCamera = useCallback(async () => {
    const img = await takePhoto('worklog-photo');
    if (img) setPicked((p) => [...p, img].slice(0, 5));
  }, [takePhoto]);

  return (
    <>
    <BlurSheet visible={visible} onClose={onClose}>
        <SheetPanel title={title} onClose={onClose}>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{editable ? hint : 'This session is closed — activity is read-only.'}</Text>

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {loading ? (
              <ActivityIndicator style={{ marginVertical: SPACING.lg }} color={colors.textSecondary} />
            ) : notes.length === 0 ? (
              <Text style={[styles.empty, { color: colors.textMuted }]}>Nothing logged yet.</Text>
            ) : (
              <>
              {notes.map((n) => (
                <View key={n.id} style={styles.noteRow}>
                  <Text style={[styles.noteTime, { color: colors.textMuted }]}>{fmtTime(n.at)}</Text>
                  <View style={[styles.noteBubble, { backgroundColor: isDark ? colors.surfaceRaised : '#f8fafc', borderColor: colors.border }, n.pendingSync && styles.pendingBubble]}>
                    {n.byManager && (
                      <View style={styles.byManagerRow}>
                        <Ionicons name="shield-checkmark-outline" size={12} color={COLORS.primary} />
                        <Text style={[styles.byManagerText, { color: COLORS.primary }]} numberOfLines={1}>
                          {n.author?.name ? `Added by ${n.author.name}` : 'Added by manager'}
                        </Text>
                      </View>
                    )}
                    <Text style={[styles.noteBody, { color: colors.textPrimary }]}>{n.body}</Text>
                    {n.attachments.length > 0 && (
                      <View style={styles.thumbs}>
                        {n.attachments.map((a) =>
                          isImg(a.mimeType) ? (
                            <TouchableOpacity key={a.id} activeOpacity={0.8} onPress={() => setViewer(a.url ?? a.fileUrl)}>
                              <Image source={{ uri: a.url ?? a.fileUrl }} style={styles.thumb} />
                            </TouchableOpacity>
                          ) : (
                            <View key={a.id} style={[styles.fileChip, { borderColor: colors.border }]}>
                              <Ionicons name="document-outline" size={14} color={colors.textSecondary} />
                              <Text style={[styles.fileName, { color: colors.textSecondary }]} numberOfLines={1}>{a.fileName}</Text>
                            </View>
                          ),
                        )}
                      </View>
                    )}
                    {n.pendingSync && (
                      <View style={styles.pendingRow}>
                        <Ionicons name="cloud-upload-outline" size={12} color={colors.textMuted} />
                        <Text style={[styles.pendingText, { color: colors.textMuted }]}>{t('offline.chip.waiting')}</Text>
                      </View>
                    )}
                  </View>
                  {/* A note still on the phone is not on the server to delete. */}
                  {editable && !n.pendingSync && (
                    <TouchableOpacity onPress={() => remove(n.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              </>
            )}
          </ScrollView>

          {/* Composer — only for the active (clocked-in) session */}
          {editable && (
          <>
          {picked.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickedRow}>
              {picked.map((p, i) => (
                <View key={i} style={styles.pickedItem}>
                  <Image source={{ uri: p.uri }} style={styles.pickedThumb} />
                  <TouchableOpacity style={styles.pickedRemove} onPress={() => setPicked((prev) => prev.filter((_, idx) => idx !== i))}>
                    <Ionicons name="close-circle" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
          <View style={styles.composer}>
            <TextInput
              style={[styles.input, { backgroundColor: isDark ? colors.surfaceRaised : '#f1f5f9', color: colors.textPrimary }]}
              placeholder="What did you just do?"
              placeholderTextColor={colors.textMuted}
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={2000}
            />
          </View>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.iconBtn} onPress={addFromCamera} disabled={picked.length >= 5}>
              <Ionicons name="camera-outline" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={addFromGallery} disabled={picked.length >= 5}>
              <Ionicons name="images-outline" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              style={[styles.addBtn, (busy || (!draft.trim() && picked.length === 0)) && { opacity: 0.5 }]}
              onPress={add}
              disabled={busy || (!draft.trim() && picked.length === 0)}
            >
              {busy ? <ActivityIndicator size="small" color={COLORS.white} /> : (
                <>
                  <Ionicons name="add" size={20} color={COLORS.white} />
                  <Text style={styles.addText}>Add</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          </>
          )}
        </SheetPanel>
      </BlurSheet>

      {/* Full-screen image preview */}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)} statusBarTranslucent>
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewer(null)}>
          {viewer && <Image source={{ uri: viewer }} style={styles.viewerImage} resizeMode="contain" />}
          <TouchableOpacity style={[styles.viewerClose, { top: insets.top + SPACING.md }]} onPress={() => setViewer(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </Pressable>
      </Modal>
    </>
  );
}

/** The old direct path, for a build without the offline layer: straight to the server, queued if that fails. */
async function legacyAdd(entryId: string, body: string, photos: PickedImage[]): Promise<void> {
  try {
    const note = await worklogApi.addNote(entryId, { body, at: new Date().toISOString() });
    for (const img of photos) {
      try {
        const pre = await worklogApi.presignAttachment(note.id, img.fileName, img.mimeType);
        await uploadToPresignedUrl(pre.uploadUrl, img.uri, img.mimeType);
        await worklogApi.confirmAttachment(note.id, {
          fileKey: pre.fileKey, fileUrl: pre.fileUrl, fileName: img.fileName,
          fileSize: img.fileSize, mimeType: img.mimeType, width: img.width, height: img.height,
        });
      } catch {
        /* photo failed — note is already saved */
      }
    }
  } catch {
    await queueLegacy(entryId, body, photos);
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  hint: { fontSize: FONT_SIZE.sm, marginTop: SPACING.xs, marginBottom: SPACING.md },
  list: { maxHeight: 320 },
  empty: { fontSize: FONT_SIZE.base, textAlign: 'center', marginVertical: SPACING.lg },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginBottom: SPACING.sm },
  noteTime: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, paddingTop: 6, width: 44 },
  noteBubble: { flex: 1, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm },
  byManagerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  byManagerText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, flexShrink: 1 },
  noteBody: { fontSize: FONT_SIZE.base, lineHeight: 20 },
  pendingBubble: { opacity: 0.75 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  pendingText: { fontSize: FONT_SIZE.xs },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginTop: SPACING.sm },
  thumb: { width: 56, height: 56, borderRadius: RADIUS.sm },
  fileChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: 8, paddingVertical: 6, maxWidth: 140 },
  fileName: { fontSize: FONT_SIZE.xs, flexShrink: 1 },
  pickedRow: { marginTop: SPACING.sm },
  pickedItem: { marginRight: SPACING.sm },
  pickedThumb: { width: 56, height: 56, borderRadius: RADIUS.sm },
  pickedRemove: { position: 'absolute', top: -6, right: -6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10 },
  composer: { marginTop: SPACING.sm },
  input: { borderRadius: RADIUS.md, padding: SPACING.md, fontSize: FONT_SIZE.base, minHeight: 44, maxHeight: 120 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.sm },
  iconBtn: { padding: SPACING.sm },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#2563eb', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: RADIUS.md },
  addText: { color: COLORS.white, fontWeight: FONT_WEIGHT.bold, fontSize: FONT_SIZE.base },
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  viewerClose: { position: 'absolute', right: SPACING.lg, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
});
