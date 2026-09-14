import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import type { PickedImage } from '../../hooks/useImagePicker';
import { worklogApi } from '../../lib/api/worklog';
import { uploadToPresignedUrl } from '../../lib/api/attachments';
import type { OfflineFiles } from '../files/offline-files';
import type { SyncEngine } from '../sync-engine';
import { addWorklogEntry } from './worklog';

/*
  The work log's first offline queue, from before the outbox: notes and their
  photos in AsyncStorage, sent when the sheet is next opened.

  Kept ONLY for binaries without the offline layer — an update reaching an
  older app must not lose what it queues. A phone that has the outbox adopts
  anything left here into it (`adoptLegacyQueue`) and never writes here again.

  ⚠️ Its known faults are why it was replaced, not fixed: it sends only when the
  sheet is opened, and a note whose photo failed is written AGAIN on the next
  try, because nothing identifies the note across attempts.
*/

const keyFor = (entryId: string) => `worklog_pending_${entryId}`;
const localId = () => `${Date.now()}_${Math.random().toString(36).slice(2)}`;
const DIR = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}worklog/` : null;

export type LegacyItem = { id: string; body: string; at: string; photos?: PickedImage[] };

export async function readLegacy(entryId: string): Promise<LegacyItem[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(entryId));
    return raw ? (JSON.parse(raw) as LegacyItem[]) : [];
  } catch {
    return [];
  }
}

async function writeLegacy(entryId: string, items: LegacyItem[]): Promise<void> {
  try {
    if (items.length) await AsyncStorage.setItem(keyFor(entryId), JSON.stringify(items));
    else await AsyncStorage.removeItem(keyFor(entryId));
  } catch {
    /* best effort */
  }
}

async function persistPhoto(img: PickedImage): Promise<PickedImage> {
  if (!DIR || img.uri.startsWith(DIR)) return img;
  try {
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
    const ext = (img.fileName.split('.').pop() || img.mimeType.split('/').pop() || 'jpg').toLowerCase();
    const dest = `${DIR}${localId()}.${ext}`;
    await FileSystem.copyAsync({ from: img.uri, to: dest });
    return { ...img, uri: dest };
  } catch {
    return img;
  }
}

async function deletePersisted(uri: string): Promise<void> {
  if (DIR && uri.startsWith(DIR)) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

export async function queueLegacy(entryId: string, body: string, photos: PickedImage[]): Promise<void> {
  const persisted = await Promise.all(photos.map(persistPhoto));
  await writeLegacy(entryId, [...(await readLegacy(entryId)), { id: localId(), body, at: new Date().toISOString(), photos: persisted }]);
}

/** Send what the old queue holds, directly. Only on a build without the outbox. */
export async function flushLegacy(entryId: string): Promise<void> {
  const items = await readLegacy(entryId);
  if (!items.length) return;
  const done = new Set<string>();
  const textOnly = items.filter((i) => !i.photos?.length);
  if (textOnly.length) {
    try {
      await worklogApi.addNotesBatch(entryId, textOnly.map((i) => ({ body: i.body, at: i.at })));
      textOnly.forEach((i) => done.add(i.id));
    } catch {
      /* still offline */
    }
  }
  for (const item of items.filter((i) => i.photos?.length)) {
    try {
      const note = await worklogApi.addNote(entryId, { body: item.body, at: item.at });
      for (const p of item.photos!) {
        const pre = await worklogApi.presignAttachment(note.id, p.fileName, p.mimeType);
        await uploadToPresignedUrl(pre.uploadUrl, p.uri, p.mimeType);
        await worklogApi.confirmAttachment(note.id, {
          fileKey: pre.fileKey, fileUrl: pre.fileUrl, fileName: p.fileName,
          fileSize: p.fileSize, mimeType: p.mimeType, width: p.width, height: p.height,
        });
      }
      for (const p of item.photos!) await deletePersisted(p.uri);
      done.add(item.id);
    } catch {
      /* kept for the next flush */
    }
  }
  await writeLegacy(entryId, items.filter((i) => !done.has(i.id)));
}

/**
 * Move whatever the old queue holds into the outbox, once. Each item keeps the
 * time it was written, and its photos are copied into the held files before
 * the old copies are removed.
 */
export async function adoptLegacyQueue(engine: SyncEngine, files: OfflineFiles, entryId: string): Promise<void> {
  const items = await readLegacy(entryId);
  if (!items.length) return;
  // Cleared first: adopting twice would write each note twice.
  await writeLegacy(entryId, []);
  const notAdopted: LegacyItem[] = [];
  for (const item of items) {
    const photos = item.photos ?? [];
    try {
      await addWorklogEntry(engine, files, { entryId, body: item.body, at: item.at, photos });
      for (const p of photos) await deletePersisted(p.uri);
    } catch {
      // A photo that could not be copied: leave the item where it was, not lost.
      notAdopted.push(item);
    }
  }
  if (notAdopted.length) await writeLegacy(entryId, notAdopted);
}
