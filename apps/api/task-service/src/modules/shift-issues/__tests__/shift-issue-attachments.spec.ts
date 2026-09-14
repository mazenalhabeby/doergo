/**
 * ⚠️ Regression: a shift-issue message's photos were checked by the prefix of
 * `fileUrl` and then signed from `fileKey` as sent, so a valid-looking URL
 * paired with another organization's key yielded a signed link to that file.
 */
import { ShiftIssuesService } from '../shift-issues.service';

const LEGACY = 'https://hel1.your-objectstorage.com/hbcfield';
const issue = { id: 'iss_1', organizationId: 'org_1' };
const prefix = 'org_1/shift-issues/iss_1/';

const store: any = {
  keyFromUrl: (u?: string | null) => (u && u.startsWith(`${LEGACY}/`) ? u.slice(LEGACY.length + 1) : null),
  privateUrl: (k: string) => `${LEGACY}/${k}`,
};
const service = new ShiftIssuesService({} as any, {} as any, {} as any, store, {} as any);

describe('shift issue attachments', () => {
  it('drops a foreign key even when the URL looks right', () => {
    const out = service.cleanAttachments(issue, [
      { fileUrl: `${LEGACY}/${prefix}ok.jpg`, fileKey: 'org_2/documents/ab/payslip.pdf', fileName: 'x', mimeType: 'image/jpeg' },
    ]);
    // Falls back to the key inside the URL, which IS under this issue.
    expect(out.map((a) => a.fileKey)).toEqual([`${prefix}ok.jpg`]);
  });

  it('drops an attachment where neither key nor URL is under this issue', () => {
    expect(
      service.cleanAttachments(issue, [
        { fileUrl: `${LEGACY}/org_2/shift-issues/iss_9/a.jpg`, fileKey: 'org_2/shift-issues/iss_9/a.jpg' },
        { fileKey: `${prefix}../../org_2/x.jpg` },
        { fileUrl: 'https://evil.example/x.jpg' },
      ]),
    ).toEqual([]);
  });

  it('keeps a key under this issue and rewrites the stored URL from it', () => {
    const [a] = service.cleanAttachments(issue, [{ fileKey: `${prefix}p.png`, fileUrl: 'https://evil.example/p.png', mimeType: 'image/svg+xml' }]);
    expect(a.fileKey).toBe(`${prefix}p.png`);
    expect(a.fileUrl).toBe(`${LEGACY}/${prefix}p.png`);
    expect(a.mimeType).toBe('');
  });

  it('caps a message at ten files', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ fileKey: `${prefix}${i}.jpg` }));
    expect(service.cleanAttachments(issue, many)).toHaveLength(10);
  });
});
