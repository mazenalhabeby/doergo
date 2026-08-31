/**
 * Where a task attachment is filed in the bucket.
 *
 * Every other kind of object begins with the organization id — documents,
 * signatures, shift-issue photos, worklog photos — which is what makes "delete
 * this tenant" or "export one customer" a prefix operation instead of a scan of
 * the whole bucket. Task attachments predate the shared ObjectStore and were the
 * one thing filed outside that scheme. Nothing leaked, because access is checked
 * in the API and never by prefix, but a per-tenant sweep would have missed them.
 *
 * Only new uploads move. Objects already stored keep their keys and the database
 * holds each full URL, so there is nothing to migrate — the two layouts coexist,
 * and the confirm step has to accept both or an upload presigned minutes before a
 * deploy fails when it is confirmed minutes after.
 */

const ENDPOINT = 'https://hel1.your-objectstorage.com';
const BUCKET = 'doergo';
const ORG = 'org-abc';
const TASK = 'task-123';

/** The key the service builds for a new upload. */
const newKey = (organizationId: string, taskId: string, stamp: number, safeName: string) =>
  `${organizationId}/attachments/${taskId}/${stamp}-${safeName}`;

/** The prefixes the confirm step accepts, in the order the service lists them. */
const acceptedPrefixes = (organizationId: string, taskId: string) => [
  `${ENDPOINT}/${BUCKET}/${organizationId}/attachments/${taskId}/`,
  `${ENDPOINT}/${BUCKET}/attachments/${taskId}/`,
];

const accepts = (url: string, organizationId = ORG, taskId = TASK) =>
  acceptedPrefixes(organizationId, taskId).some((p) => url.startsWith(p));

describe('task attachment key layout', () => {
  it('files a new upload under the organization', () => {
    expect(newKey(ORG, TASK, 1756654321000, 'photo.jpg')).toBe(
      'org-abc/attachments/task-123/1756654321000-photo.jpg',
    );
  });

  it('shares its first path segment with every other kind of object', () => {
    // The property that matters: one prefix covers everything a tenant owns.
    const keys = [
      newKey(ORG, TASK, 1, 'a.jpg'),
      `${ORG}/documents/ab/abc123.pdf`,
      `${ORG}/signatures/cd/def456.png`,
      `${ORG}/shift-issues/issue-1/uuid.jpg`,
      `${ORG}/attendance/2026/08/31/user-1/entry-1/uuid.jpg`,
    ];
    for (const k of keys) expect(k.startsWith(`${ORG}/`)).toBe(true);
  });

  it('confirms a URL in the new layout', () => {
    expect(accepts(`${ENDPOINT}/${BUCKET}/${ORG}/attachments/${TASK}/1-photo.jpg`)).toBe(true);
  });

  it('still confirms one presigned under the old layout', () => {
    // An upload presigned before a deploy is confirmed after it.
    expect(accepts(`${ENDPOINT}/${BUCKET}/attachments/${TASK}/1-photo.jpg`)).toBe(true);
  });

  it('refuses another task’s object in either layout', () => {
    expect(accepts(`${ENDPOINT}/${BUCKET}/${ORG}/attachments/other-task/1-x.jpg`)).toBe(false);
    expect(accepts(`${ENDPOINT}/${BUCKET}/attachments/other-task/1-x.jpg`)).toBe(false);
  });

  it('refuses another organization’s object', () => {
    // The new prefix is NARROWER than the old one, not looser: it pins the org too.
    expect(accepts(`${ENDPOINT}/${BUCKET}/other-org/attachments/${TASK}/1-x.jpg`)).toBe(false);
  });

  it('refuses a URL somewhere else entirely', () => {
    // The check exists to stop an arbitrary client URL being stored and then
    // rendered in the gallery.
    expect(accepts(`https://evil.example.com/${BUCKET}/${ORG}/attachments/${TASK}/x.jpg`)).toBe(false);
    expect(accepts(`${ENDPOINT}/other-bucket/${ORG}/attachments/${TASK}/x.jpg`)).toBe(false);
  });
});
