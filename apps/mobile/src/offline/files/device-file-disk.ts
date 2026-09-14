import { Directory, File, Paths } from 'expo-file-system';
import { loadImageManipulator } from '../native';
import type { FileDisk, KeepInput } from './types';

/** Longest edge a job photo is kept at. Enough to read a serial plate; a tenth of a 12 MP original. */
export const PHOTO_MAX_EDGE = 2048;
const PHOTO_QUALITY = 0.8;

/** Types re-encoded as JPEG on the way in. A PNG signature stays a PNG — it is line art. */
const SHRINKABLE = new Set(['image/jpeg', 'image/jpg', 'image/heic', 'image/heif', 'image/webp']);

function extensionFor(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'application/pdf') return 'pdf';
  return 'jpg';
}

/**
 * A member's held files, in the app's DOCUMENTS directory.
 *
 * ⚠️ Never the cache. The camera writes into the cache, and the system empties
 * it when storage runs low — a photo kept there for a sync next Tuesday may not
 * exist on Tuesday.
 *
 * One directory per member (the same separation as their database), removed
 * whole on sign-out.
 */
export class DeviceFileDisk implements FileDisk {
  constructor(private readonly dirName: string) {}

  static forMember(userId: string): DeviceFileDisk {
    return new DeviceFileDisk(`u_${userId.replace(/[^A-Za-z0-9_-]/g, '_')}`);
  }

  private dir(): Directory {
    const dir = new Directory(Paths.document, 'offline', this.dirName);
    dir.create({ intermediates: true, idempotent: true });
    return dir;
  }

  /** Where a held file lives, without touching the disk — screens render from it. */
  uriFor(id: string, mime: string): string {
    return new File(Paths.document, 'offline', this.dirName, `${id}.${extensionFor(mime)}`).uri;
  }

  async keep(input: KeepInput) {
    const dir = this.dir();
    if ('base64' in input) {
      const dest = new File(dir, `${input.id}.${extensionFor(input.mime)}`);
      dest.create({ overwrite: true });
      dest.write(input.base64.replace(/^data:[^;]+;base64,/, ''), { encoding: 'base64' });
      return { path: dest.uri, bytes: dest.size, mime: input.mime, width: input.width, height: input.height };
    }

    const lib = SHRINKABLE.has(input.mime) ? loadImageManipulator() : null;
    if (lib) {
      const ctx = lib.ImageManipulator.manipulate(input.uri);
      const { width = 0, height = 0 } = input;
      if (Math.max(width, height) > PHOTO_MAX_EDGE) {
        ctx.resize(width >= height ? { width: PHOTO_MAX_EDGE } : { height: PHOTO_MAX_EDGE });
      }
      const image = await ctx.renderAsync();
      const saved = await image.saveAsync({ compress: PHOTO_QUALITY, format: lib.SaveFormat.JPEG });
      const dest = new File(dir, `${input.id}.jpg`);
      if (dest.exists) dest.delete();
      new File(saved.uri).move(dest);
      return { path: dest.uri, bytes: dest.size, mime: 'image/jpeg', width: saved.width, height: saved.height };
    }

    // No manipulator in this build, or not a photo: keep it as it came.
    const dest = new File(dir, `${input.id}.${extensionFor(input.mime)}`);
    if (dest.exists) dest.delete();
    new File(input.uri).copy(dest);
    return { path: dest.uri, bytes: dest.size, mime: input.mime, width: input.width, height: input.height };
  }

  async remove(path: string): Promise<void> {
    try {
      const file = new File(path);
      if (file.exists) file.delete();
    } catch {
      // Already gone is the outcome wanted.
    }
  }

  /** Everything this member holds — on sign-out, once nothing is left unsent. */
  destroyAll(): void {
    try {
      const dir = new Directory(Paths.document, 'offline', this.dirName);
      if (dir.exists) dir.delete();
    } catch {
      // Nothing to delete.
    }
  }
}
