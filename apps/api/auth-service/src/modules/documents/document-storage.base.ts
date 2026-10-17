import { BadRequestException, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { type Rect, rectToPixels, isUsefulCrop } from '@hbcfield/shared';
import { ObjectStore } from '@hbcfield/shared/storage';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OBJECT_STORE } from './object-store.provider';
import { openUntrustedImage } from './image-input';

/**
 * What taking and peeking at a staged upload share: the object store, a storage
 * call with its error, cropping a photographed page, and putting two sides on one
 * page.
 */
@Injectable()
export abstract class DocumentStorageBase {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    // Injected, not constructed here — see object-store.provider.ts. Null when
    // no credentials are configured; every path that needs it says so plainly.
    @Inject(OBJECT_STORE) protected readonly store: ObjectStore | null,
  ) {
    if (!this.store) {
      this.logger.warn('S3 is not configured — document upload and download are unavailable');
    }
  }


  requireStore(): ObjectStore {
    if (!this.store) {
      throw new BadRequestException('Document storage is not configured on this server');
    }
    return this.store;
  }

  /**
   * Run a storage call and translate any failure into something a person can act on.
   *
   * The SDK's own messages are about buckets and regions — "The specified
   * bucket does not exist" told a payroll administrator nothing and, reaching a
   * toast verbatim, is exactly the class of leak this codebase already fixed
   * once for Prisma errors. The real message is logged; the caller gets a
   * sentence about their document.
   */
  async withStorage<T>(what: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      this.logger.error(`Storage failed while ${what}: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'Document storage is unavailable right now. Nothing was changed — please try again.',
      );
    }
  }

  /**
   * Cut the photograph down to what was inside the scanner's frame.
   *
   * Without this the frame is decoration: the camera captures the whole sensor,
   * so a reviewer opens a picture of a kitchen worktop with a passport in the
   * middle of it, and the OCR — which looks for a machine-readable zone in the
   * lower part of the IMAGE — searches the lower part of the worktop.
   *
   * Never fatal. A crop that cannot be applied leaves the original, which is
   * exactly what was filed before this existed.
   */
  protected async applyCrop(bytes: Buffer, crop?: Rect | null): Promise<Buffer> {
    if (!crop || !isUsefulCrop(crop)) return bytes;
    try {
      const sharp = (await import('sharp')).default;
      // `rotate()` first: the crop was computed against what the PHONE showed,
      // which already has the EXIF orientation applied, and extracting from the
      // unrotated buffer would cut a sideways rectangle out of the middle.
      //
      // The member's bytes go through the bounded opener; everything after is
      // our own output, whose dimensions we already know.
      const upright = await (await openUntrustedImage(bytes)).rotate().toBuffer();
      const meta = await sharp(upright).metadata();
      if (!meta.width || !meta.height) return bytes;

      const px = rectToPixels(crop, { width: meta.width, height: meta.height });
      if (px.width < 8 || px.height < 8) return bytes;

      return await sharp(upright).extract(px).toBuffer();
    } catch (err) {
      this.logger.warn(`Could not crop to the scanner frame: ${(err as Error).message}`);
      return bytes;
    }
  }

  /**
   * Two sides of one card, as one image.
   *
   * A European ID card or driving licence carries the categories and the
   * machine-readable zone on the BACK, so the scanner asks for both — and the
   * back was then thrown away, which meant the reader searched a front that has
   * no zone on it at all. That is the whole of "it reads nothing" for a card.
   *
   * Stacked into a single file rather than stored as two, because a document is
   * one thing: one row, one hash, one retention date, and a reviewer who sees
   * both sides without hunting for a second attachment. The reader gets both
   * too, and the zone lands in the lower part of the composite exactly where
   * the band search looks.
   */
  async composeSides(front: Buffer, back: Buffer | null): Promise<Buffer> {
    if (!back) return front;
    try {
      const sharp = (await import('sharp')).default;

      // A common width, so neither side is stretched and the seam is straight.
      // Both sides are the member's, so both go through the bounded opener.
      const [f, b] = await Promise.all([
        (await openUntrustedImage(front)).rotate().toBuffer(),
        (await openUntrustedImage(back)).rotate().toBuffer(),
      ]);
      const [fm, bm] = await Promise.all([sharp(f).metadata(), sharp(b).metadata()]);
      if (!fm.width || !fm.height || !bm.width || !bm.height) return front;

      const width = Math.max(fm.width, bm.width);
      const [fr, br] = await Promise.all([
        sharp(f).resize({ width }).toBuffer(),
        sharp(b).resize({ width }).toBuffer(),
      ]);
      const [frm, brm] = await Promise.all([sharp(fr).metadata(), sharp(br).metadata()]);

      const gap = Math.round(width * 0.02);
      const height = (frm.height ?? 0) + gap + (brm.height ?? 0);

      return await sharp({
        create: { width, height, channels: 3, background: '#ffffff' },
      })
        .composite([
          { input: fr, top: 0, left: 0 },
          { input: br, top: (frm.height ?? 0) + gap, left: 0 },
        ])
        .jpeg({ quality: 90 })
        .toBuffer();
    } catch (err) {
      // Never fatal: one side filed beats a failed upload.
      this.logger.warn(`Could not join the two sides: ${(err as Error).message}`);
      return front;
    }
  }
}
