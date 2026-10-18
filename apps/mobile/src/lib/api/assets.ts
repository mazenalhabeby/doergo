import type { ContractFields, ParsedReceipt, PresignedUpload } from '@hbcfield/shared/client';
import { call, E } from './client';
import {
  type HeldAsset,
  type MyExpense,
  type SubmitExpenseInput,
  type MyLogEntry,
  type DueItem,
  type CreateLogInput,
} from './held-asset';
export {
  type HeldAsset,
  type MyExpense,
  type SubmitExpenseInput,
  type MyLogEntry,
  type DueItem,
  type CreateLogInput,
  type RegisterHolder,
  type RegisterAsset,
  type RegisterLogEntry,
  REGISTER_PAGE_SIZE,
  assetRegisterApi,
  type MyProposal,
  assetProposalsApi,
} from './held-asset';

export type { ContractFields };

// NOTE: the client already unwraps the `{ data: T }` envelope, so nothing
// here may unwrap `.data` a second time.
export const assetsApi = {
  /**
   * What I hold right now, and whether this organization hands things out at all.
   *
   * ⚠️ `canPropose` cannot be inferred from an empty list: a member holds
   * nothing both when the organization runs no assets and when they simply have
   * not been given one — and the second is exactly who "send a document" is
   * for. Without it the button is hidden from the people who need it, or shown
   * to every organization that never bought Assets.
   */
  mine: async (): Promise<{ periods: HeldAsset[]; canPropose: boolean }> => {
    const res: { periods: HeldAsset[]; canPropose?: boolean } | null = await call(E.assets.mine);
    return { periods: res?.periods ?? [], canPropose: !!res?.canPropose };
  },

  /** What I have sent in, and what happened to it. */
  myExpenses: async (): Promise<MyExpense[]> => {
    const res: MyExpense[] | null = await call(E.assets.myExpenses);
    return res ?? [];
  },

  /**
   * A URL to PUT the photograph at.
   *
   * `occurredAt` is sent because it decides who may file this at all — the
   * check is against who held the asset ON THAT DATE, not today, so yesterday's
   * fuel can still be filed the morning after the van goes back.
   */
  presignReceipt: (assetId: string, input: { fileName: string; mimeType: string; occurredAt?: string }): Promise<PresignedUpload> =>
    call(E.assets.expensePresign, { id: assetId }, { body: input }),

  /**
   * Read a PDF receipt the phone itself cannot open.
   *
   * ⚠️ Images are NOT sent here. The on-device reader is better than anything
   * the server could run on the same photograph, and free — calling this for an
   * image would trade a good local answer for a worse remote one, plus a round
   * trip at a petrol pump on one bar of signal.
   *
   * `read: false` is a normal answer, not an error: a scanned PDF has no text
   * layer and there is nothing to find. The amount gets typed, as it would have
   * been anyway.
   */
  readReceipt: (
    assetId: string,
    input: { fileKey: string; occurredAt?: string },
  ): Promise<{ read: true; receipt: ParsedReceipt } | { read: false; reason: 'NOT_A_PDF' | 'NO_TEXT_LAYER' }> =>
    call(E.assets.expenseRead, { id: assetId }, { body: input }),

  submitExpense: (assetId: string, input: SubmitExpenseInput): Promise<MyExpense> =>
    call(E.assets.submitExpense, { id: assetId }, { body: { ...input } }),

  // ── The logbook ───────────────────────────────────────────────────────────

  /** Everything I logged, costs included, with what happened to each. */
  myLog: async (input: { assetId?: string; limit?: number } = {}): Promise<MyLogEntry[]> => {
    const res: MyLogEntry[] | null = await call(E.assets.myLog, { assetId: input.assetId, limit: input.limit || undefined });
    return res ?? [];
  },

  /** What is due soon or overdue on what I hold. Overdue first. */
  dueMine: async (): Promise<DueItem[]> => {
    const res: { items: DueItem[] } | null = await call(E.assets.dueMine);
    return res?.items ?? [];
  },

  /**
   * A URL to PUT a logbook photo at. The log type and the date travel because
   * together they decide who may file it: fuel is the driver's that day, a dent
   * is anybody's who can see the van.
   */
  presignLog: (assetId: string, input: { logType: string; fileName: string; mimeType: string; occurredAt?: string }): Promise<PresignedUpload> =>
    call(E.assets.logPresign, { id: assetId }, { body: input }),

  createLog: (assetId: string, input: CreateLogInput): Promise<MyLogEntry> =>
    call(E.assets.addLog, { id: assetId }, { body: { ...input } }),

  /** Take back my own entry while it is still waiting. */
  withdrawLog: (assetId: string, entryId: string): Promise<{ id: string }> =>
    call(E.assets.withdrawLog, { id: assetId, entryId }),
};
