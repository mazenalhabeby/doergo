import { Directory, File, Paths } from 'expo-file-system';
import type { SyncMediaLink } from '@hbcfield/shared/client';
import { SYNC_MEDIA_LINKS_MAX } from '@hbcfield/shared/client';

const dirNameFor = (userId: string) => `u_${userId.replace(/[^A-Za-z0-9_-]/g, '_')}`;

/** How much the offline image cache may hold before the oldest photos go. */
export const MEDIA_CACHE_MAX_BYTES = 250 * 1024 * 1024;

/**
 * Photos already on the server, kept on the phone so a task opens with its
 * pictures in a basement.
 *
 * ⚠️ In the CACHE directory, unlike photos waiting to upload. These exist on
 * the server; if the system clears them to free space nothing is lost, and the
 * next Wi-Fi fetches them again. Keyed by attachment id, never by URL — a link
 * changes every hour, the photo does not.
 */
export class MediaCache {
  constructor(
    private readonly dirName: string,
    private readonly deps: {
      links: (ids: string[]) => Promise<SyncMediaLink[]>;
      download: (url: string, dest: File) => Promise<void>;
    },
  ) {}

  static forMember(userId: string, deps: MediaCache['deps']): MediaCache {
    return new MediaCache(dirNameFor(userId), deps);
  }

  private dir(): Directory {
    const dir = new Directory(Paths.cache, 'media', this.dirName);
    dir.create({ intermediates: true, idempotent: true });
    return dir;
  }

  private fileFor(id: string): File {
    return new File(Paths.cache, 'media', this.dirName, `${id}.img`);
  }

  /** The kept copy of an attachment, or null when this phone has none. */
  uriFor(id: string): string | null {
    try {
      const f = this.fileFor(id);
      return f.exists ? f.uri : null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch what is not kept yet. Never throws — a cache that fails to fill is
   * only a cache that is emptier than it could be.
   */
  async prefetch(ids: readonly string[], shouldContinue: () => boolean = () => true): Promise<number> {
    const missing = [...new Set(ids)].filter((id) => !this.uriFor(id));
    let fetched = 0;
    try {
      this.dir();
      for (let i = 0; i < missing.length && shouldContinue(); i += SYNC_MEDIA_LINKS_MAX) {
        const links = await this.deps.links(missing.slice(i, i + SYNC_MEDIA_LINKS_MAX));
        for (const link of links) {
          if (!shouldContinue()) break;
          try {
            await this.deps.download(link.url, this.fileFor(link.id));
            fetched++;
          } catch {
            /* one photo that would not come down does not stop the rest */
          }
        }
      }
      this.trim();
    } catch {
      /* next time */
    }
    return fetched;
  }

  /** Bytes held, for the Sync screen. */
  sizeBytes(): number {
    try {
      const dir = new Directory(Paths.cache, 'media', this.dirName);
      if (!dir.exists) return 0;
      return dir.list().reduce((n, e) => n + (e instanceof File ? e.size ?? 0 : 0), 0);
    } catch {
      return 0;
    }
  }

  /** Oldest first, until under the cap. */
  private trim(): void {
    const dir = new Directory(Paths.cache, 'media', this.dirName);
    const files = dir.list().filter((e): e is File => e instanceof File);
    let total = files.reduce((n, f) => n + (f.size ?? 0), 0);
    if (total <= MEDIA_CACHE_MAX_BYTES) return;
    for (const f of files.sort((a, b) => (a.modificationTime ?? 0) - (b.modificationTime ?? 0))) {
      if (total <= MEDIA_CACHE_MAX_BYTES) break;
      total -= f.size ?? 0;
      try {
        f.delete();
      } catch {
        /* gone already */
      }
    }
  }

  /** On sign-out: this member's kept photos go with their database. */
  static destroyForMember(userId: string): void {
    try {
      const dir = new Directory(Paths.cache, 'media', dirNameFor(userId));
      if (dir.exists) dir.delete();
    } catch {
      /* nothing to delete */
    }
  }
}
