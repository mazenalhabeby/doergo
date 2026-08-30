import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { mrzLines } from '@hbcfield/shared';

/**
 * Reading the machine-readable zone off a photograph, on our own servers.
 *
 * The alternative was sending members' passports and ID cards to somebody
 * else's OCR endpoint, which is a decision about their personal data dressed up
 * as a technical one. This runs in-process: no third party, nothing leaves the
 * box, and no key to leak.
 *
 * MRZ is the easiest OCR problem there is, and it is worth understanding why
 * before judging the accuracy: one font (OCR-B), one case, a 37-character
 * alphabet, fixed line lengths, and — the part that matters most — CHECK DIGITS.
 * A misread character fails the checksum exactly as a forged one does. So the
 * pipeline does not need to be perfect; it needs to be right often enough that
 * a pass is trustworthy, and honest when it is not. `checkScan` turns a bad
 * read into "photograph it again", never into a false accusation.
 *
 * Three things do the heavy lifting, in order of how much they contribute:
 *
 *   THE CROP. The zone is a band at the foot of the document. Feeding the whole
 *   card asks the engine to read a face, a hologram and four languages of
 *   printed labels, and its output is then dominated by that noise.
 *
 *   THE UPSCALE AND THRESHOLD. Tesseract wants roughly 30px of x-height. A
 *   phone photo of a card gives half that, and the difference between 12 and 30
 *   pixels is the difference between garbage and a clean read.
 *
 *   THE WHITELIST. A zone cannot contain a lowercase letter or a full stop, so
 *   allowing them only invites confusion between O and o, 1 and l.
 *
 * The worker is created once and kept. Starting one costs a second or two of
 * CPU and a WASM instantiation; doing that per upload would make a busy morning
 * of onboarding into a queue of cold starts.
 */

type CreateWorker = (typeof import('tesseract.js'))['createWorker'];
type Worker = Awaited<ReturnType<CreateWorker>>;

/** Lazily required so a server that never scans never pays for the WASM. */
let createWorker: CreateWorker | undefined;

/** The whole alphabet a zone may contain. Nothing else exists in one. */
const MRZ_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';

/**
 * How long one read may take before it is abandoned.
 *
 * Bounded because this runs inside the member's upload request. An OCR that
 * takes twenty seconds has already failed as a product even if it eventually
 * returns the right answer — and the document files either way, without a scan.
 *
 * Read per call rather than at import, and overridable, because the right bound
 * depends on the box: a machine running eight jest workers that all want the
 * CPU needs longer than a container doing one thing, and a timeout that trips
 * under load looks exactly like an unreadable document.
 */
const DEFAULT_OCR_TIMEOUT_MS = 12_000;

function ocrTimeoutMs(): number {
  const configured = Number(process.env.MRZ_OCR_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_OCR_TIMEOUT_MS;
}

/** Below this, a photo has no chance of a clean read and should not be tried. */
const MIN_USABLE_WIDTH = 600;

/**
 * Where the language model lives.
 *
 * Vendored deliberately. Left to itself, tesseract.js fetches the model from a
 * public CDN THE FIRST TIME IT RUNS — which makes a member's upload depend on
 * somebody else's uptime, adds seconds to the first request after every deploy,
 * and fails outright on a box with no egress. The model is 4 MB and static;
 * there is no reason for it to arrive over the internet at runtime.
 *
 * `TESSDATA_PATH` overrides it for a container that mounts the model elsewhere.
 * If the file is genuinely absent the service leaves the path unset and lets
 * the library fall back to its download — a slow first read beats a hard
 * failure, and the log says which happened.
 */
const TESSDATA_DIR = process.env.TESSDATA_PATH || join(process.cwd(), 'tessdata');

@Injectable()
export class MrzOcrService implements OnModuleDestroy {
  private readonly logger = new Logger(MrzOcrService.name);
  private worker: Worker | null = null;
  private starting: Promise<Worker> | null = null;

  /**
   * Reads run ONE AT A TIME.
   *
   * A tesseract worker is a single WASM instance with one interpreter inside
   * it. Two `recognize` calls overlapping on the same worker interleave in that
   * instance and return each other's text — which showed up as a test where two
   * uploads arriving together each got the other's document, and would have
   * shown up in production as one member's passport data on another member's
   * record.
   *
   * The queue is a promise chain rather than a pool because the work is
   * CPU-bound: a second worker would not make two reads finish sooner on a box
   * that is already saturated, it would only double the memory.
   */
  private queue: Promise<unknown> = Promise.resolve();

  /**
   * The zone as text, or null.
   *
   * Never throws. A failed read is a document filed without a scan verdict,
   * which is exactly what happens for the gas certificates and training records
   * that have no zone at all — and far better than a failed upload.
   */
  async read(image: Buffer, mimeType: string): Promise<string | null> {
    // A PDF is a scan somebody already made; rasterising one needs a renderer
    // this service does not have, and the member's own camera path produces an
    // image anyway.
    if (!mimeType.startsWith('image/')) return null;

    try {
      return await this.withTimeout(this.attempt(image), ocrTimeoutMs());
    } catch (err) {
      this.logger.warn(`MRZ read failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * The band first, then the whole image.
   *
   * Two passes, because the crop is a guess about where the zone sits. It is
   * right for a passport page and for the back of an ID card, and wrong when
   * somebody photographs the card at a distance — so a miss falls back to the
   * full frame rather than reporting no zone.
   */
  private async attempt(image: Buffer): Promise<string | null> {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(image).metadata();
    if (!meta.width || meta.width < MIN_USABLE_WIDTH) return null;

    const band = await this.prepare(image, true);
    const fromBand = await this.recognise(band);
    if (fromBand && mrzLines(fromBand).length >= 2) return fromBand;

    const whole = await this.prepare(image, false);
    const fromWhole = await this.recognise(whole);
    return fromWhole && mrzLines(fromWhole).length >= 2 ? fromWhole : null;
  }

  /**
   * Make the picture something an OCR engine can read.
   *
   * `rotate()` with no argument applies the EXIF orientation — a phone held
   * sideways otherwise hands over an image the engine reads as a column of
   * single characters.
   */
  private async prepare(image: Buffer, cropToBand: boolean): Promise<Buffer> {
    const sharp = (await import('sharp')).default;
    let pipeline = sharp(image).rotate().grayscale();

    if (cropToBand) {
      const meta = await sharp(image).rotate().metadata();
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;
      if (width && height) {
        // The lower third. Generous on purpose: a tight crop that clips the
        // top of the first line loses the document code and the whole read.
        const top = Math.floor(height * 0.62);
        pipeline = pipeline.extract({ left: 0, top, width, height: height - top });
      }
    }

    /*
      Upscale RELATIVE to what arrived, never to a fixed width.

      The first version resized to 2000px regardless, which quietly did nothing
      when the photo was already that wide — and a 2000px photo of a card held
      at arm's length has small characters, so the engine got exactly the input
      it could not read. Tesseract wants roughly 30px of x-height and phone
      photos routinely give half that, so doubling is the floor; the cap keeps a
      12-megapixel photo from turning into a 100-megapixel one.
    */
    const source = await sharp(image).rotate().metadata();
    const target = Math.min(Math.max((source.width ?? 1000) * 2, 2000), 4000);

    return pipeline
      .resize({ width: target, withoutEnlargement: false })
      .normalise()
      // Sharpening after the upscale recovers the character edges the
      // interpolation softened.
      .sharpen()
      .png()
      .toBuffer();
  }

  private async recognise(image: Buffer): Promise<string | null> {
    const run = this.queue.then(async () => {
      const worker = await this.ensureWorker();
      const { data } = await worker.recognize(image);
      return data.text?.trim() || null;
    });
    // The chain must not break on a failure, or every later read inherits it.
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * One worker, created once, shared.
   *
   * `starting` is held so that two uploads arriving together await the SAME
   * initialisation instead of building two WASM instances and leaking one.
   */
  private async ensureWorker(): Promise<Worker> {
    if (this.worker) return this.worker;
    if (this.starting) return this.starting;

    this.starting = (async () => {
      if (!createWorker) ({ createWorker } = await import('tesseract.js'));

      const local = existsSync(join(TESSDATA_DIR, 'eng.traineddata'));
      if (!local) {
        this.logger.warn(
          `No language model at ${TESSDATA_DIR} — falling back to a download on first use. ` +
            'Ship eng.traineddata with the image to avoid this.',
        );
      }
      this.logger.log(`Starting the MRZ reader (model: ${local ? TESSDATA_DIR : 'remote'})`);

      const worker = await createWorker('eng', undefined, {
        ...(local ? { langPath: TESSDATA_DIR } : {}),
        // Whatever the source, it is cached beside the model, so a restart
        // never fetches it again.
        cachePath: TESSDATA_DIR,
      });
      await worker.setParameters({
        tessedit_char_whitelist: MRZ_ALPHABET,
        // A zone is a uniform block of text, not a page with a layout. Telling
        // the engine that stops it hunting for columns and paragraphs.
        tessedit_pageseg_mode: '6' as never,
        // The zone is monospaced by definition, which removes a whole class of
        // spacing mistakes.
        preserve_interword_spaces: '0',
      });
      this.worker = worker;
      return worker;
    })();

    try {
      return await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
      promise.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); },
      );
    });
  }

  /** The WASM instance holds memory; a restarting pod should give it back. */
  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.terminate().catch(() => undefined);
      this.worker = null;
    }
  }
}
