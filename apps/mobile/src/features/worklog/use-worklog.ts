import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../island/island-context';
import type { PickedImage } from '../../hooks/useImagePicker';
import { worklogApi, type WorkLogNote } from '../../lib/api/worklog';
import { uploadToPresignedUrl } from '../../lib/api/attachments';
import { useOffline, useSyncStatus } from '../../offline/offline-context';
import { addWorklogEntry, loadWorklog, worklogView, type WorklogItem } from '../../offline/attendance/worklog';
import { adoptLegacyQueue, flushLegacy, queueLegacy, readLegacy } from '../../offline/attendance/legacy-worklog-queue';

/**
 * ONE SHIFT'S WORK LOG — the notes, and adding or removing one.
 *
 * ⚠️ THE DATA, NOT THE SHEET. The Time tab's Today card shows the count and the
 * last note, and the sheet shows all of them with a composer; both read this,
 * so the card never says "2 notes" while the sheet shows three.
 *
 * With the offline layer a note goes into the outbox with the id it will have
 * on the server, its photos kept on the phone and uploaded when it is sent —
 * so it works with no signal and is never written twice. The list is the
 * server's notes (or the phone's saved copy of them) with everything still on
 * its way laid on top. On a build without the offline layer the old queue is
 * used, as before.
 *
 * ⚠️ `enabled` IS A REQUEST BUDGET. Nothing is fetched for a shift nobody is
 * looking at; the Today card enables it for the running shift only.
 */
export function useWorklog(timeEntryId: string | null, enabled: boolean) {
  const { t } = useTranslation();
  const toast = useToast();
  const offline = useOffline();
  const { operations } = useSyncStatus();
  const outbox = offline.engine && offline.files ? { engine: offline.engine, files: offline.files } : null;

  const [serverNotes, setServerNotes] = useState<WorkLogNote[]>([]);
  const [legacyPending, setLegacyPending] = useState<WorklogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!timeEntryId) return;
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
          attachments: (i.photos ?? []).map((ph, n) => ({
            id: `${i.id}_${n}`,
            fileName: ph.fileName,
            mimeType: ph.mimeType,
            fileUrl: ph.uri,
            url: ph.uri,
          })),
        }) as unknown as WorklogItem));
      }
      setLoading(false);
      setLoaded(true);
    }
  }, [timeEntryId, offline.records, outbox?.engine, outbox?.files]);

  // A different shift is a different log — never show one shift's notes under another.
  useEffect(() => {
    setServerNotes([]);
    setLegacyPending([]);
    setLoaded(false);
  }, [timeEntryId]);

  useEffect(() => {
    if (enabled && timeEntryId) void load();
  }, [enabled, timeEntryId, load]);

  // A note or photo accepted in the background: show the server's copy.
  const accepted = useRef(new Set<string>());
  useEffect(() => {
    if (!enabled || !timeEntryId) return;
    let fresh = false;
    for (const o of operations) {
      if (!o.op.startsWith('worklog.') || o.entityId !== timeEntryId || o.state !== 'done' || accepted.current.has(o.id)) continue;
      accepted.current.add(o.id);
      fresh = true;
    }
    if (fresh) void loadWorklog(timeEntryId, offline.records).then(setServerNotes).catch(() => undefined);
  }, [operations, enabled, timeEntryId, offline.records]);

  const notes: WorklogItem[] = useMemo(() => {
    if (!timeEntryId) return [];
    return outbox
      ? worklogView(serverNotes, timeEntryId, operations, (id, mime) => outbox.files.uriFor(id, mime))
      : [...serverNotes, ...legacyPending];
  }, [outbox?.files, serverNotes, legacyPending, operations, timeEntryId]);

  /** True when it was taken — the composer clears only then. */
  const add = useCallback(async (text: string, photos: PickedImage[]): Promise<boolean> => {
    if (!timeEntryId) return false;
    const body = text.trim() || t('worklog.photoOnly', '(photo)');
    if (!text.trim() && photos.length === 0) return false;
    try {
      if (outbox) {
        const { outcome } = await addWorklogEntry(outbox.engine, outbox.files, {
          entryId: timeEntryId,
          body,
          photos: photos.map((p) => ({ uri: p.uri, fileName: p.fileName, mimeType: p.mimeType, width: p.width, height: p.height })),
        });
        if (outcome.kind === 'refused') {
          toast.error(
            t('common.error'),
            (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) ||
              outcome.message ||
              t('common.error'),
          );
          return false;
        }
      } else {
        await legacyAdd(timeEntryId, body, photos);
        void load();
      }
      return true;
    } catch {
      toast.error(t('common.error'), t('offline.errors.PHOTO_NOT_KEPT'));
      return false;
    }
  }, [timeEntryId, outbox?.engine, outbox?.files, load, t, toast]);

  const remove = useCallback(async (id: string) => {
    setServerNotes((p) => p.filter((n) => n.id !== id));
    try { await worklogApi.deleteNote(id); } catch { void load(); }
  }, [load]);

  return { notes, loading, loaded, add, remove, reload: load };
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
