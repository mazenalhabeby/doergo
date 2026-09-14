/**
 * Overtime approved by signature on the technician's phone (Path B) is only
 * ever about THAT technician's own request.
 */
import { NotFoundException } from '@nestjs/common';
import { OvertimeService } from '../overtime.service';

it("refuses to approve a colleague's overtime by naming a real approver", async () => {
  const prisma: any = {
    overtimeRequest: { findFirst: jest.fn(async () => ({ id: 'ot1', technicianId: 'colleague', locationId: 'l1', status: 'PENDING_APPROVAL' })) },
    user: { findFirst: jest.fn(async () => ({ id: 'leader', role: 'ADMIN', memberRole: null })) },
  };
  const service = new OvertimeService(prisma, { emit: jest.fn() } as any, { add: jest.fn() } as any, {} as any);
  const approve = jest.spyOn(service as any, 'approveRequest').mockResolvedValue({});
  await expect(
    service.leaderApproveSignature({
      overtimeRequestId: 'ot1', approverId: 'leader', leaderName: 'Anna', leaderSignature: 'data:image/png;base64,AA',
      maxDurationMinutes: 60, userId: 'me', organizationId: 'o1',
    }),
  ).rejects.toThrow(NotFoundException);
  expect(approve).not.toHaveBeenCalled();
});
