/**
 * The rules a multi-sheet upload runs on — what may be submitted, in what
 * order, and what a Send tap must wait for.
 *
 * Its own module, with NO native imports, so the rules can be tested as plain
 * TypeScript. `page-upload.ts` beside it does the compressing and uploading and
 * pulls in expo-image-manipulator and the API client; importing that from a
 * test drags in the keychain and the whole HTTP stack to assert an array order.
 */

export type PageState = 'compressing' | 'uploading' | 'ready' | 'failed';

export interface Page {
  /** Stable across reorders and retries — never the array index. */
  id: string;
  /** The local file, for the thumbnail. */
  uri: string;
  state: PageState;
  /** Set once the sheet is on the server; this is what gets submitted. */
  stagingKey?: string;
  error?: string;
}

let counter = 0;

export function newPageId(): string {
  counter += 1;
  return `p${Date.now().toString(36)}-${counter}`;
}

/** The keys to submit, in the order the member arranged them. */
export function readyKeys(pages: Page[]): string[] {
  return pages
    .filter((p) => p.state === 'ready' && p.stagingKey)
    .map((p) => p.stagingKey as string);
}

/** Whether Send may proceed: every sheet is on the server. */
export function allStaged(pages: Page[]): boolean {
  return pages.length > 0 && pages.every((p) => p.state === 'ready');
}

/** Sheets still in flight — what a Send tap would have to wait for. */
export function pendingCount(pages: Page[]): number {
  return pages.filter((p) => p.state === 'compressing' || p.state === 'uploading').length;
}

/** Sheets that need the member to do something. */
export function failedCount(pages: Page[]): number {
  return pages.filter((p) => p.state === 'failed').length;
}

/** Move a sheet, keeping ids stable so an in-flight upload is not disturbed. */
export function movePage(pages: Page[], id: string, delta: -1 | 1): Page[] {
  const from = pages.findIndex((p) => p.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= pages.length) return pages;
  const next = pages.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
