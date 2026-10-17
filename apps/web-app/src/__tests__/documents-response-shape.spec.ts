/**
 * The document routes return their payload BARE.
 *
 * Most of this API wraps responses as `{ success, data }`. The document routes
 * do not — they return `[…]` or `{…}` directly. The client read
 * `response.data.data`, got `undefined`, turned it into `[]`, and every screen
 * rendered "Nothing here yet" against a database holding 184 documents.
 *
 * Nothing threw. No status was wrong. The data was discarded on arrival, which
 * is the worst shape a bug can take: it looks exactly like an empty database.
 *
 * These assertions pin the unwrap against BOTH shapes, so the client keeps
 * working whichever one a route returns.
 */

import { unwrapDocuments } from '@/lib/api/documents';
import { readSource } from '../test-utils/read-source';

describe('unwrapDocuments', () => {
  it('reads a BARE array — the shape that broke every screen', () => {
    const rows = [{ id: 'd1', title: 'Payslip August 2026' }];
    expect(unwrapDocuments<any[]>({ status: 200, data: rows })).toEqual(rows);
  });

  it('still reads a wrapped array', () => {
    const rows = [{ id: 'd1' }];
    expect(unwrapDocuments<any[]>({ status: 200, data: { success: true, data: rows } })).toEqual(rows);
  });

  it('reads a bare object', () => {
    const doc = { id: 'd1', sha256: 'abc' };
    expect(unwrapDocuments<any>({ status: 200, data: doc })).toEqual(doc);
  });

  it('reads a wrapped object', () => {
    const doc = { id: 'd1' };
    expect(unwrapDocuments<any>({ status: 200, data: { success: true, data: doc } })).toEqual(doc);
  });

  it('does not mistake a document that legitimately has a `data` field', () => {
    // An array is never a wrapper, whatever it contains.
    const rows = [{ id: 'd1', data: 'something' }];
    expect(unwrapDocuments<any[]>({ status: 200, data: rows })).toEqual(rows);
  });

  it('throws on an error rather than returning empty', () => {
    // The old code returned `[]` for a 403 too, so a permission failure and an
    // empty file looked identical on screen.
    expect(() => unwrapDocuments({ status: 403, error: 'You cannot see other members’ documents' }))
      .toThrow(/cannot see/i);
  });

  it('returns undefined for an empty body, not a phantom object', () => {
    expect(unwrapDocuments({ status: 200, data: undefined })).toBeUndefined();
    expect(unwrapDocuments({ status: 200, data: null })).toBeUndefined();
  });

  it('passes an empty array through as an empty array', () => {
    // A genuinely empty file must still render its empty state.
    expect(unwrapDocuments<any[]>({ status: 200, data: [] })).toEqual([]);
  });
});

describe('every documents call uses it', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const src = readSource(path.join(process.cwd(), 'src/lib/api/documents.ts'), 'utf8');

  // documentsApi is assembled from its parts (documents-files, documents-registers) since 2026-10-17;
  // the source read is the index plus those parts, so the whole client is the block.
  const block = src;

  it('finds the documentsApi block', () => {
    expect(block.length).toBeGreaterThan(500);
  });

  it('no call reads response.data.data any more', () => {
    // The exact expression that discarded every payload.
    expect(block).not.toContain('response.data?.data');
  });

  it('no call returns response.data raw', () => {
    expect(block).not.toMatch(/return response\.data;/);
  });

  it('every method unwraps through the helper', () => {
    const methods = block.match(/^\s{2}[a-zA-Z]+: async/gm) ?? [];
    const unwraps = block.match(/unwrapDocuments</g) ?? [];
    expect(methods.length).toBeGreaterThan(15);
    // One unwrap per method; a method that forgot would fall short.
    expect(unwraps.length).toBeGreaterThanOrEqual(methods.length);
  });

  it('a refusal keeps its code (it is the ApiError the request rejected with)', () => {
    expect(block).not.toContain('throw new Error(response.error)');
  });
});
