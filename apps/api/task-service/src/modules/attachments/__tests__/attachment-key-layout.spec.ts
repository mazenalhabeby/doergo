/**
 * Task attachments on the shared object store.
 *
 * Exercises the real service with a fake store, because the rules that matter
 * are the ones a client could abuse:
 *  - a confirm may only name an object under THIS task (no cross-tenant keys);
 *  - the server reads the object's size instead of believing the client, and an
 *    upload that never happened cannot become a row;
 *  - reads hand out signed links, never the stored provider URL;
 *  - rows written before keys existed (full URL only) still read and delete.
 */
import { AttachmentsService, attachmentKeyPrefixes } from '../attachments.service';
import { MediaSigner } from '../../../common/storage/media-signer.service';

const ORG = 'org_1';
const TASK = 'task_1';
const LEGACY = 'https://hel1.your-objectstorage.com/hbcfield';

function makeStore(objects: Record<string, number> = {}) {
  return {
    head: jest.fn(async (key: string) =>
      key in objects ? { exists: true, sizeBytes: objects[key] } : { exists: false, sizeBytes: 0 },
    ),
    delete: jest.fn(async () => true),
    presignUpload: jest.fn(async (key: string) => ({ url: `https://put/${key}`, key, headers: {}, expiresInSeconds: 3600 })),
    privateUrl: (key: string) => `${LEGACY}/${key}`,
    keyFromUrl: (url?: string | null) => (url && url.startsWith(`${LEGACY}/`) ? url.slice(LEGACY.length + 1) : null),
    mediaUrl: jest.fn(async (key: string) => `https://signed/${key}?sig=1`),
  };
}

function makeService(store: ReturnType<typeof makeStore>, task: any = { id: TASK, organizationId: ORG, assignedToId: 'u1' }) {
  const prisma: any = {
    task: { findUnique: jest.fn(async () => task) },
    attachment: {
      create: jest.fn(async ({ data }: any) => ({ id: 'att_1', createdAt: new Date(), ...data })),
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(),
      delete: jest.fn(async () => ({})),
    },
    taskEvent: { create: jest.fn(async () => ({})) },
  };
  const notify: any = { emit: jest.fn() };
  const media = new MediaSigner(store as any);
  const service = new AttachmentsService(prisma, store as any, media, notify);
  return { service, prisma, notify };
}

const caller = { uploadedById: 'u1', userRole: 'ADMIN', organizationId: ORG, taskId: TASK, fileName: 'boiler.jpg', fileType: 'image/jpeg', fileSize: 1 };

describe('attachmentKeyPrefixes', () => {
  it('pins keys to this organization and task, plus the pre-org layout', () => {
    expect(attachmentKeyPrefixes(ORG, TASK)).toEqual([`${ORG}/attachments/${TASK}/`, `attachments/${TASK}/`]);
  });
});

describe('presign', () => {
  it('builds an unguessable key without the filename', async () => {
    const store = makeStore();
    const { service } = makeService(store);
    const res: any = await service.getPresignedUrl({ ...caller, fileName: 'passport_mueller.jpg', userId: 'u1' });
    expect(res.data.fileKey).toMatch(new RegExp(`^${ORG}/attachments/${TASK}/[0-9a-f-]{36}\\.jpg$`));
    expect(res.data.fileKey).not.toContain('mueller');
    // Legacy field for app 1.0.5 round-trips to the same key.
    expect(store.keyFromUrl(res.data.fileUrl)).toBe(res.data.fileKey);
  });
});

describe('confirm', () => {
  const key = `${ORG}/attachments/${TASK}/0b8e3c9a-1111-4222-8333-944455556666.jpg`;

  it('stores the key and the size storage reports, not the size the client claims', async () => {
    const store = makeStore({ [key]: 4096 });
    const { service, prisma } = makeService(store);
    const res: any = await service.create({ ...caller, fileKey: key, fileSize: 99 });
    const data = prisma.attachment.create.mock.calls[0][0].data;
    expect(data.fileKey).toBe(key);
    expect(data.fileSize).toBe(4096);
    expect(data.mimeType).toBe('image/jpeg');
    expect(res.data.fileUrl).toBe(`https://signed/${key}?sig=1`);
  });

  it('accepts the legacy fileUrl from app 1.0.5', async () => {
    const store = makeStore({ [key]: 10 });
    const { service, prisma } = makeService(store);
    await service.create({ ...caller, fileUrl: `${LEGACY}/${key}` });
    expect(prisma.attachment.create.mock.calls[0][0].data.fileKey).toBe(key);
  });

  it.each([
    ['another tenant', `org_2/attachments/${TASK}/x.jpg`],
    ['another task', `${ORG}/attachments/task_2/x.jpg`],
    ['a document in the same org', `${ORG}/documents/ab/abc.pdf`],
    ['a climb out of the prefix', `${ORG}/attachments/${TASK}/../../org_2/x.jpg`],
  ])('refuses a key for %s', async (_, bad) => {
    const store = makeStore({ [bad]: 10 });
    const { service, prisma } = makeService(store);
    await expect(service.create({ ...caller, fileKey: bad })).rejects.toThrow('Invalid file');
    expect(prisma.attachment.create).not.toHaveBeenCalled();
  });

  it('refuses a URL that is not ours', async () => {
    const { service } = makeService(makeStore());
    await expect(service.create({ ...caller, fileUrl: 'https://evil.example/x.jpg' })).rejects.toThrow('Invalid file');
  });

  it('refuses an upload that never reached storage', async () => {
    const { service, prisma } = makeService(makeStore());
    await expect(service.create({ ...caller, fileKey: key })).rejects.toThrow('did not reach storage');
    expect(prisma.attachment.create).not.toHaveBeenCalled();
  });

  it('removes an oversized object instead of recording it', async () => {
    const store = makeStore({ [key]: 21 * 1024 * 1024 });
    const { service, prisma } = makeService(store);
    await expect(service.create({ ...caller, fileKey: key })).rejects.toThrow('larger than 20 MB');
    expect(store.delete).toHaveBeenCalledWith(key);
    expect(prisma.attachment.create).not.toHaveBeenCalled();
  });

  it('refuses an SVG even if it was uploaded', async () => {
    const store = makeStore({ [key]: 10 });
    const { service } = makeService(store);
    await expect(service.create({ ...caller, fileKey: key, fileType: 'image/svg+xml' })).rejects.toThrow('Unsupported');
  });
});

describe('reads and deletes', () => {
  it('signs every attachment and never returns the stored provider URL', async () => {
    const store = makeStore();
    const { service, prisma } = makeService(store);
    prisma.attachment.findMany.mockResolvedValue([
      { id: 'a', fileName: 'new.jpg', fileKey: `${ORG}/attachments/${TASK}/n.jpg`, fileUrl: `${LEGACY}/x`, mimeType: 'image/jpeg' },
      { id: 'b', fileName: 'old.jpg', fileKey: null, fileUrl: `${LEGACY}/attachments/${TASK}/old.jpg`, mimeType: null },
      { id: 'c', fileName: 'disk.jpg', fileKey: null, fileUrl: '/uploads/x.jpg', mimeType: null },
    ]);
    const res: any = await service.findByTask({ taskId: TASK, userId: 'u1', userRole: 'ADMIN', organizationId: ORG });
    expect(res.data.map((a: any) => a.fileUrl)).toEqual([
      `https://signed/${ORG}/attachments/${TASK}/n.jpg?sig=1`,
      `https://signed/attachments/${TASK}/old.jpg?sig=1`,
      null,
    ]);
  });

  it('deletes the object behind a legacy row', async () => {
    const store = makeStore();
    const { service, prisma } = makeService(store);
    prisma.attachment.findUnique.mockResolvedValue({
      id: 'b', taskId: TASK, uploadedById: 'u1', fileName: 'old.jpg', fileKey: null,
      fileUrl: `${LEGACY}/attachments/${TASK}/old.jpg`, task: { organizationId: ORG },
    });
    await service.remove({ id: 'b', userId: 'u1', userRole: 'ADMIN', organizationId: ORG });
    expect(store.delete).toHaveBeenCalledWith(`attachments/${TASK}/old.jpg`);
    expect(prisma.attachment.delete).toHaveBeenCalled();
  });
});
