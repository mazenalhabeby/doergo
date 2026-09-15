import { outcomeOf, type ActionOutcome } from '../actions/outcome';
import type { OfflineFiles } from '../files/offline-files';
import { uuidv7 } from '../ids';
import type { SyncEngine } from '../sync-engine';

/**
 * Log something done to a thing I hold — fuel, an oil change, a dent — with or
 * without signal.
 *
 * The same shape as filing an expense, on purpose: a logbook entry IS a row of
 * the same ledger on the server, and the phone treats it the same way. The id
 * is made here so a resend after a dropped answer files one entry, not two;
 * the photo is copied into the held files and uploaded when the entry is sent,
 * then deleted once the entry is accepted or refused — a picture of a slip or
 * a dent lives no longer than it must.
 *
 * The lane is per ASSET: two entries on the same van keep their order (an
 * odometer typed after another must arrive after it), while a second van's
 * entries do not wait behind the first's photo upload.
 */
export async function logFromPhone(
  engine: SyncEngine,
  files: OfflineFiles,
  input: {
    assetId: string;
    logType: string;
    /** Answers keyed by field key; a money field already in integer cents. */
    values: Record<string, string | number>;
    note?: string;
    occurredAt: string;
    photo?: { uri: string; mime: string } | null;
  },
): Promise<ActionOutcome> {
  const entryId = uuidv7();
  if (input.photo) {
    await files.keep({ id: entryId, kind: 'photo', mime: input.photo.mime, uri: input.photo.uri });
  }
  try {
    const op = await engine.enqueueAndSettle({
      op: 'log.create',
      lane: `log:${input.assetId}`,
      entityId: input.assetId,
      payload: {
        params: { assetId: input.assetId },
        body: {
          entryId,
          logType: input.logType,
          values: input.values,
          ...(input.note ? { note: input.note } : {}),
          occurredAt: input.occurredAt,
          // The phone's marker for a photo still to upload; the upload replaces it with the key.
          ...(input.photo ? { receiptPending: true, receiptName: 'photo.jpg' } : {}),
        },
      },
    });
    return await outcomeOf(engine, op);
  } catch (err) {
    await files.forget(entryId);
    throw err;
  }
}
