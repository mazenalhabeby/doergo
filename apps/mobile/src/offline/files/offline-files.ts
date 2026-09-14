import type { FileDisk, FileKind, FileRegistry, KeepInput, StoredFile } from './types';

/**
 * What a screen needs of held files: keep one, and find it again to show it.
 * The bytes and the row are written together here and nowhere else.
 */
export class OfflineFiles {
  constructor(
    private readonly deps: {
      registry: FileRegistry;
      disk: FileDisk & { uriFor(id: string, mime: string): string };
      now?: () => number;
    },
  ) {}

  /**
   * Copy (and shrink) a file into the member's held files.
   *
   * Bytes first, then the row: a row pointing at nothing would make its
   * operation fail with FILE_MISSING; bytes with no row are only disk space.
   */
  async keep(input: KeepInput & { kind: FileKind }): Promise<StoredFile> {
    const kept = await this.deps.disk.keep(input);
    const file: StoredFile = {
      id: input.id,
      path: kept.path,
      kind: input.kind,
      mime: kept.mime,
      bytes: kept.bytes,
      width: kept.width,
      height: kept.height,
      takenAt: this.deps.now?.() ?? Date.now(),
      state: 'kept',
      createdAt: this.deps.now?.() ?? Date.now(),
    };
    try {
      await this.deps.registry.add(file);
    } catch (err) {
      await this.deps.disk.remove(kept.path);
      throw err;
    }
    return file;
  }

  /** Drop a file whose operation was never recorded. */
  async forget(id: string): Promise<void> {
    const file = await this.deps.registry.remove(id);
    if (file) await this.deps.disk.remove(file.path);
  }

  uriFor(id: string, mime: string): string {
    return this.deps.disk.uriFor(id, mime);
  }
}
