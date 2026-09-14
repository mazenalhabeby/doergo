/**
 * Service report photos on the shared object store — the same rules as task
 * attachments, because a report photo ends up in a PDF sent to the customer.
 */
import { ReportsService, reportKeyPrefixes } from '../reports.service';
import { MediaSigner } from '../../../common/storage/media-signer.service';

const ORG = 'org_1';
const REPORT = 'rep_1';
const LEGACY = 'https://hel1.your-objectstorage.com/hbcfield';

function setup(objects: Record<string, { size: number; type?: string }> = {}) {
  const store: any = {
    head: jest.fn(async (k: string) => (k in objects ? { exists: true, sizeBytes: objects[k].size, contentType: objects[k].type } : { exists: false, sizeBytes: 0 })),
    delete: jest.fn(async () => true),
    presignUpload: jest.fn(async (key: string) => ({ url: `https://put/${key}`, key, headers: {}, expiresInSeconds: 3600 })),
    privateUrl: (k: string) => `${LEGACY}/${k}`,
    keyFromUrl: (u?: string | null) => (u && u.startsWith(`${LEGACY}/`) ? u.slice(LEGACY.length + 1) : null),
    mediaUrl: jest.fn(async (k: string) => `https://signed/${k}`),
  };
  const prisma: any = {
    serviceReport: { findUnique: jest.fn(async () => ({ id: REPORT, organizationId: ORG, completedById: 'tech' })) },
    reportAttachment: { create: jest.fn(async ({ data }: any) => ({ id: 'ra1', ...data })), findUnique: jest.fn(), delete: jest.fn() },
  };
  const service = new ReportsService(prisma, store, new MediaSigner(store), { emit: jest.fn() } as any);
  return { service, store, prisma };
}

const base = { reportId: REPORT, type: 'BEFORE' as const, fileName: 'before.jpg', userId: 'tech', userRole: 'EMPLOYEE', organizationId: ORG };

describe('report photo upload', () => {
  const key = `${ORG}/reports/${REPORT}/1c9a2b3d-0000-4000-8000-000000000001.jpg`;

  it('prefixes', () => {
    expect(reportKeyPrefixes(ORG, REPORT)).toEqual([`${ORG}/reports/${REPORT}/`, `reports/${REPORT}/`]);
  });

  it('presigns an organization-first key without the filename', async () => {
    const { service } = setup();
    const res: any = await service.getPresignedUrl({ reportId: REPORT, fileName: 'kunde_haus.jpg', fileType: 'image/jpeg', userId: 'tech', userRole: 'EMPLOYEE', organizationId: ORG });
    expect(res.data.fileKey).toMatch(new RegExp(`^${ORG}/reports/${REPORT}/[0-9a-f-]{36}\\.jpg$`));
  });

  it('records key, storage size and a signed link', async () => {
    const { service, prisma } = setup({ [key]: { size: 2048 } });
    const res: any = await service.addAttachment({ ...base, fileKey: key, fileType: 'image/jpeg', fileSize: 1 });
    const data = prisma.reportAttachment.create.mock.calls[0][0].data;
    expect([data.fileKey, data.fileSize, data.mimeType]).toEqual([key, 2048, 'image/jpeg']);
    expect(res.data.url).toBe(`https://signed/${key}`);
  });

  it('uses storage content type when app 1.0.5 sends none', async () => {
    const legacyKey = `reports/${REPORT}/171-a.png`;
    const { service, prisma } = setup({ [legacyKey]: { size: 10, type: 'image/png' } });
    await service.addAttachment({ ...base, fileUrl: `${LEGACY}/${legacyKey}` });
    expect(prisma.reportAttachment.create.mock.calls[0][0].data.mimeType).toBe('image/png');
  });

  it('removes and refuses a non-image object', async () => {
    const { service, store, prisma } = setup({ [key]: { size: 10, type: 'text/html' } });
    await expect(service.addAttachment({ ...base, fileKey: key })).rejects.toThrow('must be images');
    expect(store.delete).toHaveBeenCalledWith(key);
    expect(prisma.reportAttachment.create).not.toHaveBeenCalled();
  });

  it.each([`org_2/reports/${REPORT}/x.jpg`, `${ORG}/reports/rep_2/x.jpg`, `${ORG}/attachments/t/x.jpg`])('refuses foreign key %s', async (bad) => {
    const { service } = setup({ [bad]: { size: 10, type: 'image/jpeg' } });
    await expect(service.addAttachment({ ...base, fileKey: bad })).rejects.toThrow('Invalid file');
  });

  it('refuses when nothing was uploaded', async () => {
    const { service } = setup();
    await expect(service.addAttachment({ ...base, fileKey: key, fileType: 'image/jpeg' })).rejects.toThrow('did not reach storage');
  });

  it('refuses a technician attaching to someone else\'s report', async () => {
    const { service } = setup({ [key]: { size: 10 } });
    await expect(service.addAttachment({ ...base, userId: 'other', fileKey: key, fileType: 'image/jpeg' })).rejects.toThrow('reports you created');
  });
});
