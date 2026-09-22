import { File as FsFile } from 'expo-file-system';
import { loadImageManipulator } from '../offline/native';
import { documentsApi } from './api/documents';
import { uploadToPresignedUrl } from './api/attachments';
import { type Page } from './page-order';

export * from './page-order';

/**
 * A sheet of a multi-page document, on its way to the server.
 *
 * ⚠️ THE UPLOAD STARTS THE MOMENT THE SHEET IS TAKEN, not when the member taps
 * Send. Somebody photographing a six-page hotel invoice spends fifteen seconds
 * doing it; uploading afterwards makes them wait a second time for bytes that
 * could have gone while they were still shooting. By the time Send is tapped
 * the early pages are usually already filed, and the tap waits only for the
 * last one or two.
 *
 * ⚠️ The compression bound matches the server's `MAX_EDGE` in
 * `apps/api/auth-service/src/modules/documents/pages-pdf.ts`. Sending a 12-
 * megapixel original spends the member's mobile data on pixels the server
 * immediately throws away — on a van's hotspot that is the whole difference
 * between this feeling instant and feeling broken.
 */

/**
 * The file's real length.
 *
 * ⚠️ Not optional. The server refuses a presign with `sizeBytes <= 0` — "A file
 * size is required" — so a placeholder zero here fails EVERY page, and the tile
 * can only offer Retry, which fails identically. That was the first version of
 * this file.
 */
function fileSize(uri: string): number {
  try {
    return new FsFile(uri).size ?? 0;
  } catch {
    return 0;
  }
}

/** Matches MAX_EDGE server-side: ~190 dpi across A4, past anything read on screen. */
const MAX_EDGE = 2200;

/** A page of text stops improving well before this; the bytes do not. */
const QUALITY = 0.75;

/**
 * Shrink one sheet to what the server will keep.
 *
 * Returns the original on failure rather than throwing: a sheet that would not
 * compress is still a sheet worth filing, and it is the SERVER's bound that is
 * load-bearing. This one only saves the member's data.
 */
export async function compressSheet(uri: string): Promise<{ uri: string; bytes: number }> {
  /*
    ⚠️ Through the LOADER, never a top-level import.

    `expo-image-manipulator` binds its native module on evaluation, so a static
    import throws in any binary built before it was added — and an OTA reaches
    every install of a version. That is exactly how `asset-expense.tsx` became
    unreachable: expo-router imports every route while building the tree, so its
    top-level `expo-document-picker` import took the whole route down.
    `native-imports.spec.ts` fails on a static import here, correctly.

    Absent, the sheet is uploaded at the size the camera gave. Slower on a van's
    hotspot, still correct — the SERVER's bound is the load-bearing one.
  */
  const manipulator = loadImageManipulator();
  if (!manipulator) return { uri, bytes: fileSize(uri) };
  try {
    const out = await manipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_EDGE } }],
      { compress: QUALITY, format: manipulator.SaveFormat.JPEG },
    );
    return { uri: out.uri, bytes: fileSize(out.uri) };
  } catch {
    return { uri, bytes: fileSize(uri) };
  }
}

/**
 * Compress one sheet and put it on the server, reporting each step.
 *
 * `onChange` is called on every transition so the thumbnail can show progress
 * without the caller polling.
 */
export async function stagePage(
  page: Page,
  typeId: string,
  onChange: (next: Page) => void,
): Promise<Page> {
  const emit = (patch: Partial<Page>): Page => {
    const next = { ...page, ...patch };
    page = next;
    onChange(next);
    return next;
  };

  try {
    /*
      ⚠️ A PDF is passed through untouched.

      Compressing it would mean rasterising it, which turns a five-page invoice
      with selectable text into one picture of its first page. The server keeps
      its pages as they are; the phone's only job is to deliver the bytes.
    */
    const isPdf = page.mimeType === 'application/pdf';
    const mime = isPdf ? 'application/pdf' : 'image/jpeg';

    const small = isPdf
      ? { uri: page.uri, bytes: fileSize(page.uri) }
      : (emit({ state: 'compressing' }), await compressSheet(page.uri));

    if (small.bytes <= 0) {
      // Nothing readable at that path. Said plainly rather than letting the
      // server answer "A file size is required", which means nothing here.
      throw new Error('That file could not be read from this phone');
    }

    emit({ state: 'uploading', uri: small.uri });
    const presigned = await documentsApi.ownUploadUrl({
      typeId,
      mimeType: mime,
      sizeBytes: small.bytes,
    });
    await uploadToPresignedUrl(presigned.url, small.uri, mime);

    return emit({ state: 'ready', stagingKey: presigned.key });
  } catch (err) {
    /*
      ⚠️ A failed sheet is KEPT, not dropped. It stays on screen as "tap to
      retry" holding its local file, so a member who lost signal on page four of
      six does not rephotograph all six. Dropping it silently is how people end
      up filing an invoice with a page missing and never knowing.
    */
    return emit({
      state: 'failed',
      error: err instanceof Error ? err.message : 'Could not send this page',
    });
  }
}

