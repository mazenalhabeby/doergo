/**
 * The storage rules every service now leans on.
 *
 * Kept here rather than in `packages/shared` because shared has no runner of its
 * own; the task service maps `@hbcfield/shared/*` to source, so this exercises
 * the real module.
 */
import {
  ObjectStore,
  keyFromStoredUrl,
  newObjectKey,
  extensionForMime,
  objectStoreConfigFromEnv,
} from '@hbcfield/shared/storage';

const HETZNER = 'https://hel1.your-objectstorage.com/hbcfield';

describe('keyFromStoredUrl', () => {
  it('reads the key out of a legacy path-style URL', () => {
    expect(keyFromStoredUrl(`${HETZNER}/org1/attachments/t1/171-a.jpg`, [HETZNER])).toBe(
      'org1/attachments/t1/171-a.jpg',
    );
  });

  it('ignores a query string (a signed URL pasted back in)', () => {
    expect(keyFromStoredUrl(`${HETZNER}/org1/x.jpg?X-Amz-Signature=abc`, [HETZNER])).toBe('org1/x.jpg');
  });

  it('returns null for anything that is not ours', () => {
    expect(keyFromStoredUrl('https://evil.example/hbcfield/org1/x.jpg', [HETZNER])).toBeNull();
    expect(keyFromStoredUrl('/uploads/avatars/u1.png', [HETZNER])).toBeNull();
    expect(keyFromStoredUrl('', [HETZNER])).toBeNull();
    expect(keyFromStoredUrl(null, [HETZNER])).toBeNull();
  });

  it('refuses a key that climbs out of its prefix', () => {
    expect(keyFromStoredUrl(`${HETZNER}/org1/../org2/x.jpg`, [HETZNER])).toBeNull();
    expect(keyFromStoredUrl(`${HETZNER}//etc/passwd`, [HETZNER])).toBeNull();
  });

  it('refuses a malformed escape rather than throwing', () => {
    expect(keyFromStoredUrl(`${HETZNER}/org1/%E0%A4%A.jpg`, [HETZNER])).toBeNull();
  });

  it('accepts a base with or without a trailing slash', () => {
    expect(keyFromStoredUrl(`${HETZNER}/k.png`, [`${HETZNER}/`])).toBe('k.png');
  });
});

describe('newObjectKey', () => {
  it('is org / kind / parent / random id . extension', () => {
    const key = newObjectKey({ organizationId: 'org_1', kind: 'attachments', parentId: 'task-9', mime: 'image/jpeg' });
    expect(key).toMatch(/^org_1\/attachments\/task-9\/[0-9a-f-]{36}\.jpg$/);
  });

  it('never repeats', () => {
    const a = newObjectKey({ organizationId: 'o', kind: 'reports', parentId: 'r', mime: 'image/png' });
    const b = newObjectKey({ organizationId: 'o', kind: 'reports', parentId: 'r', mime: 'image/png' });
    expect(a).not.toBe(b);
  });

  it.each(['../other', 'a/b', '', 'x'.repeat(200), 'org 1'])('refuses an unsafe segment %p', (bad) => {
    expect(() => newObjectKey({ organizationId: bad, kind: 'attachments', parentId: 't', mime: 'image/png' })).toThrow();
    expect(() => newObjectKey({ organizationId: 'o', kind: 'attachments', parentId: bad, mime: 'image/png' })).toThrow();
  });

  it('never carries the uploader filename', () => {
    const key = newObjectKey({ organizationId: 'o', kind: 'attachments', parentId: 't', mime: 'application/pdf' });
    expect(key).not.toMatch(/passport|mueller/i);
    expect(key.endsWith('.pdf')).toBe(true);
  });
});

describe('extensionForMime', () => {
  it('maps what we accept and falls back to bin', () => {
    expect(extensionForMime('image/heic')).toBe('heic');
    expect(extensionForMime('IMAGE/PNG')).toBe('png');
    expect(extensionForMime('image/svg+xml')).toBe('bin');
  });
});

describe('objectStoreConfigFromEnv', () => {
  const creds = { S3_ACCESS_KEY: 'a', S3_SECRET_KEY: 'b' };

  it('is null without credentials', () => {
    expect(objectStoreConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it('treats EMPTY variables as unset (compose passes S3_ENDPOINT=)', () => {
    const c = objectStoreConfigFromEnv({ ...creds, S3_ENDPOINT: '', S3_BUCKET: '' } as NodeJS.ProcessEnv)!;
    expect(c.endpoint).toBe('https://hel1.your-objectstorage.com');
    expect(c.bucket).toBe('hbcfield');
    expect(c.publicBaseUrl).toBe(HETZNER);
  });

  it('reads the public base, legacy bases and ACL support', () => {
    const c = objectStoreConfigFromEnv({
      ...creds,
      S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com/',
      S3_PUBLIC_BASE_URL: 'https://files.hbcfield.com/',
      S3_LEGACY_BASE_URLS: `${HETZNER}, https://old.example/b/`,
      S3_OBJECT_ACL: 'false',
    } as NodeJS.ProcessEnv)!;
    expect(c.endpoint).toBe('https://acc.r2.cloudflarestorage.com');
    expect(c.publicBaseUrl).toBe('https://files.hbcfield.com');
    expect(c.legacyBaseUrls).toEqual([HETZNER, 'https://old.example/b']);
    expect(c.supportsObjectAcl).toBe(false);
  });
});

describe('ObjectStore URLs', () => {
  const store = new ObjectStore({
    endpoint: 'https://acc.r2.cloudflarestorage.com',
    region: 'auto',
    bucket: 'hbcfield',
    accessKeyId: 'a',
    secretAccessKey: 'b',
    publicBaseUrl: 'https://files.hbcfield.com',
    legacyBaseUrls: [HETZNER],
  });

  it('builds public URLs on the public base, not the provider', () => {
    expect(store.publicUrl('org/avatars/u/1.png')).toBe('https://files.hbcfield.com/org/avatars/u/1.png');
  });

  it('reads keys from the current, the path-style and the legacy base', () => {
    expect(store.keyFromUrl('https://files.hbcfield.com/o/k.png')).toBe('o/k.png');
    expect(store.keyFromUrl('https://acc.r2.cloudflarestorage.com/hbcfield/o/k.png')).toBe('o/k.png');
    expect(store.keyFromUrl(`${HETZNER}/o/k.png`)).toBe('o/k.png');
  });

  it('signs a media link that renders images inline and never SVG', async () => {
    const png = decodeURIComponent(await store.mediaUrl('o/k.png', { fileName: 'a.png', contentType: 'image/png' }));
    expect(png).toContain('inline');
    const svg = decodeURIComponent(await store.mediaUrl('o/k.svg', { fileName: 'a.svg', contentType: 'image/svg+xml' }));
    expect(svg).toContain('attachment');
  });
});
