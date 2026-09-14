/**
 * A work-log note (and its photo) written offline and sent — possibly twice.
 */
import { WorklogService } from '../worklog.service';

const session = { id: 'e1', userId: 'u1', organizationId: 'o1', clockInAt: new Date('2026-09-14T06:00:00Z'), locationId: 'l1' };
const PREFIX = 'o1/attendance/2026/09/14/u1/e1/';

function build() {
  const notes = new Map<string, any>();
  const atts = new Map<string, any>();
  const prisma: any = {
    timeEntry: { findFirst: jest.fn().mockResolvedValue(session) },
    task: { findFirst: jest.fn().mockResolvedValue(null) },
    timeEntryNote: {
      findUnique: jest.fn(async ({ where }: any) => notes.get(where.id) ?? null),
      findFirst: jest.fn(async ({ where }: any) => (notes.has(where.id) ? { id: where.id, timeEntryId: 'e1' } : null)),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: data.id ?? `n${notes.size + 1}`, ...data };
        notes.set(row.id, row);
        return row;
      }),
    },
    timeEntryNoteAttachment: {
      findUnique: jest.fn(async ({ where }: any) => atts.get(where.id) ?? null),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: data.id ?? `a${atts.size + 1}`, ...data };
        atts.set(row.id, row);
        return row;
      }),
    },
  };
  const store: any = { head: jest.fn().mockResolvedValue({ exists: true, sizeBytes: 1234 }), privateUrl: (k: string) => `s3://${k}`, keyFromUrl: () => null, delete: jest.fn() };
  const media: any = { sign: jest.fn(async (a: any) => ({ ...a, url: 'https://signed' })), signAll: jest.fn() };
  return { service: new WorklogService(prisma, store, media), prisma, store };
}

const me = { organizationId: 'o1', callerUserId: 'u1', canManage: false, timeEntryId: 'e1' };

describe('work log recorded offline', () => {
  it('keeps the phone id, and a resend returns the same note', async () => {
    const { service, prisma } = build();
    const first: any = await service.addNote({ ...me, id: 'note-phone-00000001', body: 'Nozzle replaced', at: '2026-09-14T09:12:00.000Z' });
    const again: any = await service.addNote({ ...me, id: 'note-phone-00000001', body: 'Nozzle replaced', at: '2026-09-14T09:12:00.000Z' });
    expect(first.data.id).toBe('note-phone-00000001');
    expect(first.data.at).toEqual(new Date('2026-09-14T09:12:00.000Z'));
    expect(again.data).toBe(first.data);
    expect(prisma.timeEntryNote.create).toHaveBeenCalledTimes(1);
  });

  it("refuses an id that belongs to somebody else's note", async () => {
    const { service } = build();
    await service.addNote({ ...me, id: 'note-phone-00000001', body: 'Mine' });
    await expect(service.addNote({ ...me, callerUserId: 'manager', canManage: true, id: 'note-phone-00000001', body: 'Theirs' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ID_IN_USE' }),
    });
  });

  it('answers a resent photo confirm with the same attachment, without asking storage again', async () => {
    const { service, prisma, store } = build();
    await service.addNote({ ...me, id: 'note-phone-00000001', body: '(photo)' });
    const confirm = { ...me, noteId: 'note-phone-00000001', id: 'att-phone-000000001', fileKey: `${PREFIX}x.jpg`, fileName: 'x.jpg', mimeType: 'image/jpeg', width: 2048.4 };
    const first: any = await service.confirmAttachment(confirm);
    const again: any = await service.confirmAttachment(confirm);
    expect(first.data).toMatchObject({ id: 'att-phone-000000001', width: 2048, fileSize: 1234 });
    expect(again.data.id).toBe('att-phone-000000001');
    expect(prisma.timeEntryNoteAttachment.create).toHaveBeenCalledTimes(1);
    expect(store.head).toHaveBeenCalledTimes(1);
  });

  it("still refuses a key outside the member's own session", async () => {
    const { service } = build();
    await service.addNote({ ...me, id: 'note-phone-00000001', body: '(photo)' });
    await expect(
      service.confirmAttachment({ ...me, noteId: 'note-phone-00000001', id: 'att-phone-000000002', fileKey: 'o2/attendance/2026/09/14/u9/e9/x.jpg', fileName: 'x.jpg', mimeType: 'image/jpeg' }),
    ).rejects.toThrow('Invalid file');
  });
});
