import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TaskAccessService } from '../../../common/task-access/task-access.service';
import { AttachmentsService } from '../attachments.service';

/**
 * Deleting an attachment asks the ORGANIZATION first. The uploader check ran
 * before it, so a caller from another organization got 403 "only your own
 * attachments" — confirmation that the id exists.
 */
describe('attachment delete: organization before uploader', () => {
  const make = () => {
    const prisma: any = {
      attachment: {
        findUnique: jest.fn().mockResolvedValue({ id: 'a1', taskId: 't1', uploadedById: 'mike', fileName: 'x.jpg', task: { organizationId: 'org1' } }),
        delete: jest.fn(),
      },
      taskEvent: { create: jest.fn() },
    };
    const media: any = { keyOf: jest.fn().mockReturnValue(null) };
    return { svc: new AttachmentsService(prisma, null, media, { emit: jest.fn() } as any, new TaskAccessService(prisma)), prisma };
  };

  it('another organization — even its ADMIN — gets 404', async () => {
    const { svc, prisma } = make();
    await expect(svc.remove({ id: 'a1', userId: 'stranger', userRole: 'EMPLOYEE', organizationId: 'org2' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.remove({ id: 'a1', userId: 'boss', userRole: 'ADMIN', organizationId: 'org2' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.attachment.delete).not.toHaveBeenCalled();
  });

  it('a colleague in the same organization who did not upload it gets 403', async () => {
    const { svc } = make();
    await expect(svc.remove({ id: 'a1', userId: 'sarah', userRole: 'EMPLOYEE', organizationId: 'org1' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('the uploader deletes it', async () => {
    const { svc, prisma } = make();
    await svc.remove({ id: 'a1', userId: 'mike', userRole: 'EMPLOYEE', organizationId: 'org1' });
    expect(prisma.attachment.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
  });
});
