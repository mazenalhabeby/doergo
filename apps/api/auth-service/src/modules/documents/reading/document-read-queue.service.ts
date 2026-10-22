import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { type ObjectStore } from '@hbcfield/shared/storage';
import { OBJECT_STORE } from '../core/object-store.provider';
import { PrismaService } from '@hbcfield/shared';
import { DOCUMENT_READERS, type DocumentReader, type DocumentReading } from './document-reader';

import { personName } from '@hbcfield/shared';
/** A document that could not be read twice is left to the reviewer, not retried forever. */
const MAX_ATTEMPTS = 2;
/** Give the service time to settle before the first sweep. */
const SWEEP_DELAY_MS = 30_000;

/**
 * Reads a member's document AFTER it is filed — never while they wait.
 *
 * The upload used to run the OCR inline with a 12-second limit, so a dense
 * visa foil timed out and was filed unread, and a member on a slow connection
 * waited on a server-side read their phone had usually already done. Now the
 * filing returns at once and the read happens here, one document at a time,
 * with as long as it needs.
 *
 * ⚠️ What it writes is a READING, kept beside the scan in `scanData.reading`.
 * Only a PROVEN date (zone check digits passed) becomes `expiresOn` on its own,
 * and only where the document has none. A suggested date is shown to the
 * reviewer pre-filled; a person accepts it, so a misread never becomes a fact
 * nobody looked at.
 *
 * Safe on several replicas: every write is conditional on the document still
 * waiting for review, and a second read of the same document writes the same
 * answer.
 */
@Injectable()
export class DocumentReadQueue implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DocumentReadQueue.name);
  private chain: Promise<unknown> = Promise.resolve();
  private readonly queued = new Set<string>();
  private sweepTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore | null,
    @Inject(DOCUMENT_READERS) private readonly readers: DocumentReader[],
  ) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    this.sweepTimer = setTimeout(() => void this.sweep(), SWEEP_DELAY_MS);
    this.sweepTimer.unref?.();
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.sweepTimer) clearTimeout(this.sweepTimer);
  }

  /** Read this document soon. Returns at once; a document already queued is not queued twice. */
  enqueue(documentId: string): void {
    if (this.stopped || this.queued.has(documentId)) return;
    this.queued.add(documentId);
    this.chain = this.chain
      .then(() => this.readOne(documentId))
      .catch((err) => this.logger.warn(`Background read failed for document=${documentId}: ${err}`))
      .finally(() => this.queued.delete(documentId));
  }

  /** Everything waiting for review that has not been read yet — including what was filed before this existed. */
  async sweep(): Promise<number> {
    const waiting = await this.prisma.document.findMany({
      where: { status: 'PENDING_VERIFICATION', OR: [{ expiresOn: null }, { scanVerdict: null }] },
      select: { id: true, scanData: true },
      orderBy: { issuedAt: 'asc' },
      take: 200,
    });
    let n = 0;
    for (const d of waiting) {
      const reading = readingOf(d.scanData);
      if (reading?.expiresOn || (reading?.attempts ?? 0) >= MAX_ATTEMPTS) continue;
      this.enqueue(d.id);
      n += 1;
    }
    if (n) this.logger.log(`Queued ${n} waiting documents for a background read`);
    return n;
  }

  /** Read one document with every reader in turn, and keep the best answer. */
  async readOne(documentId: string): Promise<DocumentReading | null> {
    if (!this.store) return null;
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        organizationId: true,
        userId: true,
        status: true,
        storageKey: true,
        mimeType: true,
        expiresOn: true,
        scanVerdict: true,
        scanData: true,
        title: true,
        user: { select: { firstName: true, lastName: true, dateOfBirth: true } },
        type: { select: { label: true } },
      },
    });
    if (!doc || doc.status !== 'PENDING_VERIFICATION' || !doc.storageKey) return null;

    const bytes = await this.store.get(doc.storageKey);
    let best: DocumentReading | null = null;
    let title: string | null = null;
    for (const reader of this.readers) {
      const reading: DocumentReading = await reader.read({ bytes, mimeType: doc.mimeType, member: doc.user });
      title = title ?? reading.title ?? null;
      if (!best || rank(reading) > rank(best)) best = reading;
      if (best.certainty === 'PROVEN') break; // nothing beats proof
    }
    if (!best) return null;
    best = { ...best, title };

    // A zone or barcode found here gets the same duplicate check the upload path runs.
    let scan = best.scan;
    if (scan?.extracted.documentNumber) {
      const other = await this.prisma.document.findFirst({
        where: {
          organizationId: doc.organizationId,
          documentNumber: scan.extracted.documentNumber,
          userId: { not: doc.userId },
          status: { in: ['ISSUED', 'SIGNED', 'PENDING_VERIFICATION'] },
        },
        select: { user: { select: { firstName: true, lastName: true } } },
      });
      if (other && best.scan) {
        scan = {
          ...best.scan,
          verdict: 'SUSPECT',
          checks: [
            ...best.scan.checks.filter((c) => c.id !== 'notAlreadyFiled'),
            { id: 'notAlreadyFiled', outcome: 'FAIL', detail: personName(other.user) },
          ],
        };
      }
    }

    const previous = readingOf(doc.scanData);
    const stored = {
      expiresOn: best.expiresOn,
      certainty: best.certainty,
      source: best.source,
      label: best.label,
      engine: best.engine,
      unreadable: best.unreadable,
      at: new Date().toISOString(),
      attempts: (previous?.attempts ?? 0) + 1,
    };
    const baseScanData = (doc.scanData && typeof doc.scanData === 'object' ? doc.scanData : {}) as Record<
      string,
      unknown
    >;
    // A read whose zone PROVES itself replaces an older verdict — that one came
    // from a worse read of the same picture, and showing it would flag a
    // document the arithmetic has just cleared.
    const useScan = scan && (!doc.scanVerdict || best.certainty === 'PROVEN');

    await this.prisma.document.updateMany({
      where: { id: doc.id, status: 'PENDING_VERIFICATION' },
      data: {
        scanData: { ...baseScanData, ...(useScan ? scan!.extracted : {}), reading: stored } as object,
        ...(useScan
          ? {
              scanFormat: scan!.format,
              scanVerdict: scan!.verdict,
              scanChecks: scan!.checks as unknown as object,
              holderName: scan!.extracted.holderName,
              documentNumber: scan!.extracted.documentNumber,
              dateOfBirth: scan!.extracted.dateOfBirth ? new Date(scan!.extracted.dateOfBirth) : null,
              issuingState: scan!.extracted.issuingState,
            }
          : {}),
        // Its own name, but only where it still carries the type's label or a
        // file name — never over a title somebody chose.
        ...(best.title && isGenericTitle(doc.title, doc.type.label) ? { title: best.title } : {}),
        // Only a proven date stands on its own, and never over one already there.
        ...(best.certainty === 'PROVEN' && best.expiresOn && !doc.expiresOn && scan?.verdict !== 'SUSPECT'
          ? { expiresOn: new Date(`${best.expiresOn}T12:00:00Z`) }
          : {}),
      },
    });
    this.logger.log(
      `Read document=${doc.id}: ${best.expiresOn ? `${best.certainty} ${best.source}` : `nothing (${best.unreadable ?? 'no date'})`}`,
    );
    return best;
  }
}

/** "Other document", or "IMG_0042" / "scan 3" — a name nobody chose. */
function isGenericTitle(title: string, typeLabel: string): boolean {
  const t = title.trim();
  return (
    t === typeLabel.trim() ||
    /^(img|image|scan|photo|dsc|pxl|document|doc|file|whatsapp)[\s_\-]*[\w\s\-.]*$/i.test(t) ||
    /^\d[\d_\-\s]*$/.test(t)
  );
}

/** PROVEN beats SUGGESTED beats a reading with a zone but no date beats nothing. */
function rank(r: DocumentReading): number {
  if (r.certainty === 'PROVEN') return 4;
  if (r.certainty === 'SUGGESTED' && r.source === 'LABEL') return 3;
  if (r.certainty === 'SUGGESTED') return 2;
  if (r.scan) return 1;
  return 0;
}

export interface StoredReading {
  expiresOn: string | null;
  certainty: 'PROVEN' | 'SUGGESTED' | null;
  source: 'MRZ' | 'BARCODE' | 'LABEL' | 'TEXT' | null;
  label: string | null;
  engine: string;
  unreadable: 'HEIC' | 'NOT_AN_IMAGE' | 'NO_TEXT' | null;
  at: string;
  attempts: number;
}

/** The reading kept on a document, or null. */
export function readingOf(scanData: unknown): StoredReading | null {
  if (!scanData || typeof scanData !== 'object') return null;
  const r = (scanData as { reading?: unknown }).reading;
  return r && typeof r === 'object' ? (r as StoredReading) : null;
}
