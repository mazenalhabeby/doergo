/*
  Multi-sheet uploads: the rules that decide whether a member loses work.

  The performance shape — compress to the server's own bound, and start each
  sheet's upload the moment it is taken rather than when Send is tapped — is
  what makes photographing a six-page invoice feel instant on a van's hotspot.
  The rules below are what stop that speed costing a page.
*/
import {
  movePage,
  readyKeys,
  allStaged,
  pendingCount,
  failedCount,
  newPageId,
  type Page,
} from '../page-order';

const page = (id: string, state: Page['state'], key?: string): Page => ({
  id,
  uri: `file:///${id}.jpg`,
  state,
  ...(key ? { stagingKey: key } : {}),
});

describe('what gets submitted', () => {
  it('submits the keys in the order the member arranged them, not upload order', () => {
    // Page 3 finished first on a flaky connection; the document is still 1,2,3.
    const pages = [page('a', 'ready', 'k-a'), page('b', 'ready', 'k-b'), page('c', 'ready', 'k-c')];
    expect(readyKeys(pages)).toEqual(['k-a', 'k-b', 'k-c']);
  });

  it('never submits a sheet that has not landed', () => {
    const pages = [page('a', 'ready', 'k-a'), page('b', 'uploading'), page('c', 'failed')];
    expect(readyKeys(pages)).toEqual(['k-a']);
  });

  it('refuses to call a document complete while a sheet is in flight', () => {
    expect(allStaged([page('a', 'ready', 'k-a'), page('b', 'uploading')])).toBe(false);
    expect(allStaged([page('a', 'ready', 'k-a'), page('b', 'ready', 'k-b')])).toBe(true);
  });

  it('is not complete with no pages at all', () => {
    expect(allStaged([])).toBe(false);
  });

  it('counts what a Send tap would wait for, and what needs the member', () => {
    const pages = [
      page('a', 'ready', 'k-a'),
      page('b', 'compressing'),
      page('c', 'uploading'),
      page('d', 'failed'),
    ];
    expect(pendingCount(pages)).toBe(2);
    expect(failedCount(pages)).toBe(1);
  });
});

describe('reordering', () => {
  it('moves a sheet without disturbing the others', () => {
    const pages = [page('a', 'ready'), page('b', 'ready'), page('c', 'ready')];
    expect(movePage(pages, 'c', -1).map((p) => p.id)).toEqual(['a', 'c', 'b']);
    expect(movePage(pages, 'a', 1).map((p) => p.id)).toEqual(['b', 'a', 'c']);
  });

  it('does nothing at the ends rather than wrapping around', () => {
    const pages = [page('a', 'ready'), page('b', 'ready')];
    expect(movePage(pages, 'a', -1)).toBe(pages);
    expect(movePage(pages, 'b', 1)).toBe(pages);
  });

  it('keeps ids stable, so a reorder cannot disturb an upload in flight', () => {
    // ⚠️ The id is the identity, never the array index: reordering while page 2
    // is still uploading must not make its result land on a different sheet.
    const pages = [page('a', 'uploading'), page('b', 'ready', 'k-b')];
    const moved = movePage(pages, 'b', -1);
    expect(moved[0].id).toBe('b');
    expect(moved[1].id).toBe('a');
    expect(moved[1].state).toBe('uploading');
  });
});

describe('page ids', () => {
  it('are unique even when several sheets are taken in the same millisecond', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newPageId()));
    expect(ids.size).toBe(50);
  });
});
