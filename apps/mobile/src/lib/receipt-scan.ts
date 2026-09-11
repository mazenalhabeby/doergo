import { parseReceipt, parseContract, type ParsedReceipt, type ParsedContract } from '@hbcfield/shared/client';
import { canReadText, readLines } from './ocr';

/**
 * A photograph of a receipt or a contract → the fields worth keeping.
 *
 * The same split as everything else that reads a page: pixels are `./ocr`'s
 * job, and deciding which figure on the slip is the total is ours, in
 * `parseReceipt`, which is pure and tested without a device. Nothing calls out
 * — the model ships inside the app, so a fuel receipt reads at a motorway pump
 * with one bar of signal and costs nothing per scan.
 */

/** Can this BUILD read a slip at all? Asked before the camera is offered. */
export const canScanReceipts = canReadText;

/** Reading a contract needs exactly what reading a slip needs. */
export const canScanContracts = canReadText;

export async function scanReceipt(uri: string): Promise<{ receipt: ParsedReceipt; lines: string[] }> {
  const lines = await readLines(uri);
  return { receipt: parseReceipt(lines), lines };
}

/**
 * A contract, read the same way and by the same reader.
 *
 * ⚠️ The TEXT NEVER LEAVES THE PHONE. What goes to the server is the fields
 * after a person has corrected them — a plate, a make, two dates. A rental
 * agreement carries the member's home address, their licence number and their
 * bank details, and none of that is the organization's to keep.
 */
export async function scanContract(uri: string): Promise<{ contract: ParsedContract; lines: string[] }> {
  const lines = await readLines(uri);
  return { contract: parseContract(lines), lines };
}

export type { ParsedReceipt, ParsedContract };
