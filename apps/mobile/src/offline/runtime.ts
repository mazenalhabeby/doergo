import { File as FsFile } from 'expo-file-system';
import { ConnectivityMonitor } from './connectivity';
import { openOfflineDatabase } from './db/database';
import { RecordsStore } from './db/records-store';
import { SqliteOutboxStore } from './db/sqlite-outbox-store';
import { DeviceFileDisk } from './files/device-file-disk';
import { MediaCache } from './files/media-cache';
import { OfflineFiles } from './files/offline-files';
import { SqliteFileRegistry } from './files/sqlite-file-registry';
import { FileUploadPreparer } from './files/upload-preparer';
import { httpMediaLinks, httpObjectUploader, httpSyncTransport } from './http-transport';
import { uuidv7 } from './ids';
import { OfflinePreferencesStore } from './preferences';
import { SyncEngine } from './sync-engine';

/**
 * One connectivity monitor for the whole app, fed by every request — not only
 * the offline path — so "limited" is noticed on whatever screen fails first.
 */
export const connectivity = new ConnectivityMonitor();

export interface OfflineRuntime {
  records: RecordsStore;
  files: OfflineFiles;
  media: MediaCache;
  preferences: OfflinePreferencesStore;
  engine: SyncEngine;
}

/**
 * Everything the offline layer runs on, for one member — built in ONE place.
 *
 * The app builds it when a member is signed in; the background sync task builds
 * it again in its own JS context, with no React tree. Two hand-wired copies
 * would drift the first time a store or a rule is added to one of them, and a
 * background sync that uploads without the Wi-Fi-only rule is exactly that
 * drift. Null on a build without the offline layer's native parts.
 */
export async function createOfflineRuntime(member: { userId: string; organizationId: string }): Promise<OfflineRuntime | null> {
  const dbPromise = openOfflineDatabase(member.userId);
  if (!dbPromise) return null;
  const db = await dbPromise;

  const records = new RecordsStore(db);
  const registry = new SqliteFileRegistry(db);
  const disk = DeviceFileDisk.forMember(member.userId);
  const files = new OfflineFiles({ registry, disk });
  const preferences = new OfflinePreferencesStore(member.userId);
  await preferences.load();
  const media = MediaCache.forMember(member.userId, {
    links: httpMediaLinks,
    download: async (url, dest) => {
      await FsFile.downloadFileAsync(url, dest, { idempotent: true });
    },
  });
  const engine = new SyncEngine({
    userId: member.userId,
    organizationId: member.organizationId,
    store: new SqliteOutboxStore(db),
    transport: httpSyncTransport,
    records,
    preparer: new FileUploadPreparer({
      files: registry,
      disk,
      uploader: httpObjectUploader,
      mayUpload: () => !preferences.current.photosOnWifiOnly || connectivity.unmetered,
    }),
    newId: () => uuidv7(),
  });
  await engine.start();
  return { records, files, media, preferences, engine };
}
