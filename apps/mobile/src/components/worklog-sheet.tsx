import { useState, useCallback, useEffect } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/theme-context';
import { SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, COLORS } from '../lib/constants';
import { useImagePicker, type PickedImage } from '../hooks/useImagePicker';
import { BlurSheet } from './blur-sheet';
import { SheetPanel } from './sheet-panel';
import { worklogApi, type WorkLogNote } from '../lib/api/worklog';
import { uploadToPresignedUrl } from '../lib/api/attachments';

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const isImg = (m: string) => m.startsWith('image/');
const pendingKey = (entryId: string) => `worklog_pending_${entryId}`;
const localId = () => `${Date.now()}_${Math.random().toString(36).slice(2)}`;

// A queued (offline) note — text + the picked photos (their persisted URIs +
// metadata) so photos re-upload on flush, not just the text.
type PendingItem = { id: string; body: string; at: string; photos?: PickedImage[] };

// Queued photos are COPIED into persistent app storage so they survive an app
// restart / OS cache eviction until the flush uploads them.
const WORKLOG_DIR = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}worklog/` : null;

async function persistPhoto(img: PickedImage): Promise<PickedImage> {
  if (!WORKLOG_DIR || img.uri.startsWith(WORKLOG_DIR)) return img;
  try {
    await FileSystem.makeDirectoryAsync(WORKLOG_DIR, { intermediates: true }).catch(() => {});
    const ext = (img.fileName.split('.').pop() || img.mimeType.split('/').pop() || 'jpg').toLowerCase();
    const dest = `${WORKLOG_DIR}${localId()}.${ext}`;
    await FileSystem.copyAsync({ from: img.uri, to: dest });
    return { ...img, uri: dest };
  } catch {
    return img; // fall back to the cache URI
  }
}

async function deletePersisted(uri: string): Promise<void> {
  if (WORKLOG_DIR && uri.startsWith(WORKLOG_DIR)) {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}

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
 * Session work-log sheet: add timestamped notes (+ photos) during a shift. Notes
 * post immediately; if offline they queue in AsyncStorage and batch-flush next
 * time the sheet opens. Photos upload phone→S3 direct (presign → PUT → confirm).
 */
export function WorkLogSheet({ visible, onClose, timeEntryId, title, hint, editable = true }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { pickFromGallery, takePhoto } = useImagePicker();

  const [notes, setNotes] = useState<WorkLogNote[]>([]);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [picked, setPicked] = useState<PickedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null); // full-screen image preview

  const flushPending = useCallback(async () => {
    let items: PendingItem[] = [];
    try {
      const raw = await AsyncStorage.getItem(pendingKey(timeEntryId));
      items = raw ? JSON.parse(raw) : [];
    } catch {
      return;
    }
    if (!items.length) return;

    const done = new Set<string>();
    // Text-only notes → one batch request.
    const textOnly = items.filter((i) => !i.photos || i.photos.length === 0);
    if (textOnly.length) {
      try {
        await worklogApi.addNotesBatch(timeEntryId, textOnly.map((i) => ({ body: i.body, at: i.at })));
        textOnly.forEach((i) => done.add(i.id));
      } catch {
        /* still offline */
      }
    }
    // Notes with photos → recreate the note, then re-upload each queued photo.
    for (const item of items.filter((i) => i.photos && i.photos.length)) {
      try {
        const note = await worklogApi.addNote(timeEntryId, { body: item.body, at: item.at });
        for (const p of item.photos!) {
          const pre = await worklogApi.presignAttachment(note.id, p.fileName, p.mimeType);
          await uploadToPresignedUrl(pre.uploadUrl, p.uri, p.mimeType);
          await worklogApi.confirmAttachment(note.id, {
            fileKey: pre.fileKey, fileUrl: pre.fileUrl, fileName: p.fileName,
            fileSize: p.fileSize, mimeType: p.mimeType, width: p.width, height: p.height,
          });
        }
        // Uploaded — drop the persisted copies.
        for (const p of item.photos!) await deletePersisted(p.uri);
        done.add(item.id);
      } catch {
        /* keep for next flush — note text + persisted photos aren't lost */
      }
    }

    // Persist only what still didn't make it.
    try {
      const remaining = items.filter((i) => !done.has(i.id));
      if (remaining.length) await AsyncStorage.setItem(pendingKey(timeEntryId), JSON.stringify(remaining));
      else await AsyncStorage.removeItem(pendingKey(timeEntryId));
    } catch {
      /* best effort */
    }
  }, [timeEntryId]);

  const readPending = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(pendingKey(timeEntryId));
      setPending(raw ? JSON.parse(raw) : []);
    } catch {
      setPending([]);
    }
  }, [timeEntryId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await flushPending();
      setNotes(await worklogApi.list(timeEntryId));
    } catch {
      /* leave whatever we have */
    } finally {
      await readPending(); // surface anything still queued (offline) so it's visible
      setLoading(false);
    }
  }, [timeEntryId, flushPending, readPending]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const queueOffline = useCallback(async (item: PendingItem) => {
    try {
      const raw = await AsyncStorage.getItem(pendingKey(timeEntryId));
      const q: PendingItem[] = raw ? JSON.parse(raw) : [];
      q.push(item);
      await AsyncStorage.setItem(pendingKey(timeEntryId), JSON.stringify(q));
    } catch {
      /* best effort */
    }
  }, [timeEntryId]);

  const add = useCallback(async () => {
    const body = draft.trim();
    if (!body && picked.length === 0) return;
    setBusy(true);
    const at = new Date().toISOString();
    try {
      const note = await worklogApi.addNote(timeEntryId, { body: body || '(photo)', at });
      // Upload each photo direct to S3 (best-effort per photo — never lose the note).
      for (const img of picked) {
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
      // Offline: copy the photos into persistent storage and queue the note +
      // photos so both re-upload on the next flush — nothing is lost, even across
      // an app restart.
      const persisted = await Promise.all(picked.map(persistPhoto));
      await queueOffline({ id: localId(), body: body || '(photo)', at, photos: persisted });
    } finally {
      setDraft('');
      setPicked([]);
      setBusy(false);
      load();
    }
  }, [draft, picked, timeEntryId, queueOffline, load]);

  const remove = useCallback(async (id: string) => {
    setNotes((p) => p.filter((n) => n.id !== id));
    try { await worklogApi.deleteNote(id); } catch { load(); }
  }, [load]);

  const addFromGallery = useCallback(async () => {
    const imgs = await pickFromGallery();
    if (imgs.length) setPicked((p) => [...p, ...imgs].slice(0, 5));
  }, [pickFromGallery]);

  const addFromCamera = useCallback(async () => {
    const img = await takePhoto();
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
            ) : notes.length === 0 && pending.length === 0 ? (
              <Text style={[styles.empty, { color: colors.textMuted }]}>Nothing logged yet.</Text>
            ) : (
              <>
              {notes.map((n) => (
                <View key={n.id} style={styles.noteRow}>
                  <Text style={[styles.noteTime, { color: colors.textMuted }]}>{fmtTime(n.at)}</Text>
                  <View style={[styles.noteBubble, { backgroundColor: isDark ? colors.surfaceRaised : '#f8fafc', borderColor: colors.border }]}>
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
                  </View>
                  {editable && (
                    <TouchableOpacity onPress={() => remove(n.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {/* Queued (offline) notes — shown so you always see what you added,
                  even before it syncs. */}
              {pending.map((p) => (
                <View key={p.id} style={styles.noteRow}>
                  <Text style={[styles.noteTime, { color: colors.textMuted }]}>{fmtTime(p.at)}</Text>
                  <View style={[styles.noteBubble, { backgroundColor: isDark ? colors.surfaceRaised : '#f8fafc', borderColor: colors.border, opacity: 0.75 }]}>
                    <Text style={[styles.noteBody, { color: colors.textPrimary }]}>{p.body}</Text>
                    {!!p.photos?.length && (
                      <View style={styles.thumbs}>
                        {p.photos.map((ph, i) => <Image key={i} source={{ uri: ph.uri }} style={styles.thumb} />)}
                      </View>
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <Ionicons name="cloud-upload-outline" size={12} color={colors.textMuted} />
                      <Text style={{ fontSize: FONT_SIZE.xs, color: colors.textMuted }}>Pending upload…</Text>
                    </View>
                  </View>
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
