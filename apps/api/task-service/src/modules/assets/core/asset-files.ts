/**
 * Where a photograph filed against an asset lives, and what one may be.
 *
 * One definition for the expense flow and the logbook, because the PREFIX is a
 * security check as much as a path: every route that accepts an uploaded key
 * refuses one outside `${organizationId}/asset-receipts/${assetId}/`, which is
 * what stops a key from another tenant or another asset being attached here.
 * Two copies of that string are two checks that can drift apart.
 *
 * The folder is still called `asset-receipts` for a logbook photo of a dent:
 * renaming it would orphan every slip already in the bucket, and the name is
 * never shown to anybody.
 */

/** A photograph or a PDF. Nothing else needs to reach this bucket. */
export const ASSET_FILE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

export const ASSET_FILE_MAX_BYTES = 15 * 1024 * 1024;

export function assetFilePrefix(organizationId: string, assetId: string): string {
  return `${organizationId}/asset-receipts/${assetId}/`;
}

/** A key WE presigned, for THIS asset, in THIS organization. */
export function isAssetFileKey(key: string, organizationId: string, assetId: string): boolean {
  return !key.includes('..') && key.startsWith(assetFilePrefix(organizationId, assetId));
}
