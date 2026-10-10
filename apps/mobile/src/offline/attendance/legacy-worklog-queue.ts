import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import type { PickedImage } from '../../hooks/useImagePicker';
import { worklogApi } from '../../lib/api/worklog';
import { uploadToPresignedUrl } from '../../lib/api/attachments';
import { sessionOwnerId } from '../../lib/api/client';
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

/*
  ⚠️ KEYED BY MEMBER. These are somebody's notes and photos from their shift,
  and they used to sit under the time entry's id alone — readable and sendable
  by whoever signed in next. The owner is the session's (the token's `sub`);
  the old unkeyed list is still read once, so an update loses nothing, and is
  removed the first time it is written back.
*/
const PREFIX = 'worklog_pending_';
const oldKeyFor = (entryId: string) => `${PREFIX}${entryId}`;
const keyFor = (owner: string, entryId: string) => `${PREFIX}${owner}:${entryId}`;
const localId = () => `${Date.now()}_${Math.random().toString(36).slice(2)}`;
const DIR = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}worklog/` : null;

type LegacyItem = { id: string; body: string; at: string; photos?: PickedImage[] };

async function parse(raw: string | null): Promise<LegacyItem[]> {
  try {
    const items = raw ? (JSON.parse(raw) as LegacyItem[]) : [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export async function readLegacy(entryId: string): Promise<LegacyItem[]> {
  const owner = await sessionOwnerId();
  if (!owner) return [];
  try {
    const [mine, old] = await Promise.all([AsyncStorage.getItem(keyFor(owner, entryId)), AsyncStorage.getItem(oldKeyFor(entryId))]);
    return [...(await parse(old)), ...(await parse(mine))];
  } catch {
    return [];
  }
}

async function writeLegacy(entryId: string, items: LegacyItem[]): Promise<void> {
  const owner = await sessionOwnerId();
  if (!owner) return;
  try {
    // What was read from the old shared key is now in `items`; it lives under the owner from here on.
    await AsyncStorage.removeItem(oldKeyFor(entryId));
    if (items.length) await AsyncStorage.setItem(keyFor(owner, entryId), JSON.stringify(items));
    else await AsyncStorage.removeItem(keyFor(owner, entryId));
  } catch {
    /* best effort */
  }
}

/** Does the old queue still hold anything for this member? — counted as unsent work at sign-out. */
export async function legacyWorklogWaiting(owner: string): Promise<boolean> {
  try {
    const all = (await AsyncStorage.getAllKeys()) ?? [];
    return all.some((k) => k.startsWith(`${PREFIX}${owner}:`) || (k.startsWith(PREFIX) && !k.includes(':')));
  } catch {
    return false;
  }
}

/** The end of a session with nothing kept: every queued note and its photos go. */
export async function forgetLegacyWorklog(): Promise<void> {
  try {
    const all = (await AsyncStorage.getAllKeys()) ?? [];
    const drop = all.filter((k) => k.startsWith(PREFIX));
    if (drop.length) await AsyncStorage.multiRemove(drop);
  } catch {
    /* best effort */
  }
  if (DIR) await FileSystem.deleteAsync(DIR, { idempotent: true }).catch(() => undefined);
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
