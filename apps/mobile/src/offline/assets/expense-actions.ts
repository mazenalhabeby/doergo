import { outcomeOf, type ActionOutcome } from '../actions/outcome';
import type { OfflineFiles } from '../files/offline-files';
import { uuidv7 } from '../ids';
import type { SyncEngine } from '../sync-engine';

/**
 * File an expense against something I hold — with or without signal.
 *
 * The receipt photo is copied into the held files (the camera's copy is
 * deleted by the screen as before) and uploaded when the expense is sent; the
 * kept copy is deleted once the expense is accepted or refused — it is a
 * picture of somebody's card slip and lives no longer than it must.
 *
 * `uploadedKey` is a receipt already uploaded (a PDF the server had to read):
 * it is sent as it is, never uploaded twice.
 */
export async function submitExpenseFromPhone(
  engine: SyncEngine,
  files: OfflineFiles,
  input: {
    assetId: string;
    category: string;
    amountCents: number;
    note?: string;
    occurredAt: string;
    photo?: { uri: string; mime: string } | null;
    uploadedKey?: string | null;
  },
): Promise<ActionOutcome> {
  const entryId = uuidv7();
  const receipt = input.uploadedKey
    ? { receiptKey: input.uploadedKey, receiptName: 'receipt.pdf', receiptMime: 'application/pdf' }
    : input.photo
      ? { receiptPending: true, receiptName: 'receipt.jpg' }
      : {};
  if (!input.uploadedKey && input.photo) {
    await files.keep({ id: entryId, kind: 'photo', mime: input.photo.mime, uri: input.photo.uri });
  }
  try {
    const op = await engine.enqueueAndSettle({
      op: 'expense.submit',
      lane: `expense:${input.assetId}`,
      entityId: input.assetId,
      payload: {
        params: { assetId: input.assetId },
        body: {
          entryId,
          category: input.category,
          amountCents: input.amountCents,
          ...(input.note ? { note: input.note } : {}),
          occurredAt: input.occurredAt,
          ...receipt,
        },
      },
    });
    return await outcomeOf(engine, op);
  } catch (err) {
    await files.forget(entryId);
    throw err;
  }
}
