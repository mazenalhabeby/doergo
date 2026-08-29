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

/** The helper as api.ts implements it, kept in step by the source check below. */
function unwrapDocuments<T>(response: { data?: unknown; error?: string }): T | undefined {
  if (response.error) throw new Error(response.error);
  const body = response.data as any;
  if (body === null || body === undefined) return undefined;
  if (!Array.isArray(body) && typeof body === 'object' && 'data' in body) {
    return body.data as T;
  }
  return body as T;
}

describe('unwrapDocuments', () => {
  it('reads a BARE array — the shape that broke every screen', () => {
    const rows = [{ id: 'd1', title: 'Payslip August 2026' }];
    expect(unwrapDocuments<any[]>({ data: rows })).toEqual(rows);
  });

  it('still reads a wrapped array', () => {
    const rows = [{ id: 'd1' }];
    expect(unwrapDocuments<any[]>({ data: { success: true, data: rows } })).toEqual(rows);
  });

  it('reads a bare object', () => {
    const doc = { id: 'd1', sha256: 'abc' };
    expect(unwrapDocuments<any>({ data: doc })).toEqual(doc);
  });

  it('reads a wrapped object', () => {
    const doc = { id: 'd1' };
    expect(unwrapDocuments<any>({ data: { success: true, data: doc } })).toEqual(doc);
  });

  it('does not mistake a document that legitimately has a `data` field', () => {
    // An array is never a wrapper, whatever it contains.
    const rows = [{ id: 'd1', data: 'something' }];
    expect(unwrapDocuments<any[]>({ data: rows })).toEqual(rows);
  });

  it('throws on an error rather than returning empty', () => {
    // The old code returned `[]` for a 403 too, so a permission failure and an
    // empty file looked identical on screen.
    expect(() => unwrapDocuments({ error: 'You cannot see other members’ documents' }))
      .toThrow(/cannot see/i);
  });

  it('returns undefined for an empty body, not a phantom object', () => {
    expect(unwrapDocuments({ data: undefined })).toBeUndefined();
    expect(unwrapDocuments({ data: null })).toBeUndefined();
  });

  it('passes an empty array through as an empty array', () => {
    // A genuinely empty file must still render its empty state.
    expect(unwrapDocuments<any[]>({ data: [] })).toEqual([]);
  });
});

describe('every documents call uses it', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const src = fs.readFileSync(path.join(process.cwd(), 'src/lib/api.ts'), 'utf8');

  const block = src.slice(
    src.indexOf('export const documentsApi = {'),
    src.indexOf('\n};', src.indexOf('export const documentsApi = {')),
  );

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

  it('the shipped helper matches the one asserted above', () => {
    // This file reimplements it to test it in isolation. If the real one
    // changes shape, the copy here would keep passing and prove nothing.
    expect(src).toContain("if (!Array.isArray(body) && typeof body === 'object' && 'data' in body)");
  });
});
