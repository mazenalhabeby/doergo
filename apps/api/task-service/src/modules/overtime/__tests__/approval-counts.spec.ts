/**
 * Approving from the web Overtime page, or by signature, counts the minutes the
 * same way as the phone's extra-time screen — through attendance, which moves
 * the shift's expected end and recounts a closed shift.
 */
import { OVERTIME_CONSTANTS } from '@hbcfield/shared';
import { OvertimeService } from '../overtime.service';

const ROUND = { id: 'ot1', timeEntryId: 'entry-1', technicianId: 'member', locationId: 'l1', organizationId: 'o1', status: 'PENDING_APPROVAL' };

function setup() {
  const prisma: any = {
    overtimeRequest: { findFirst: jest.fn(async () => ROUND), update: jest.fn(async () => ({})) },
    user: { findFirst: jest.fn(async () => ({ id: 'leader', role: 'ADMIN', memberRole: null })) },
  };
  const queue = { add: jest.fn() };
  const attendance = { approveExtraTime: jest.fn(async () => ({ success: true, data: { entryId: 'entry-1' } })) };
  const service = new OvertimeService(prisma, { emit: jest.fn() } as any, queue as any, attendance as any);
  return { service, prisma, queue, attendance };
}

it('a remote approval goes through attendance, and schedules no clock-out', async () => {
  const { service, queue, attendance, prisma } = setup();
  await service.leaderApprove({ overtimeRequestId: 'ot1', approverId: 'leader', maxDurationMinutes: 90, notes: 'Boiler', organizationId: 'o1' });

  expect(attendance.approveExtraTime).toHaveBeenCalledWith({
    approverId: 'leader', entryId: 'entry-1', minutes: 90, organizationId: 'o1', signature: null, notes: 'Boiler',
  });
  expect(queue.add).not.toHaveBeenCalled();
  // The round is written by attendance, not marked approved here on its own.
  expect(prisma.overtimeRequest.update).not.toHaveBeenCalled();
});

it('never approves more than the overtime ceiling', async () => {
  const { service, attendance } = setup();
  await service.leaderApprove({ overtimeRequestId: 'ot1', approverId: 'leader', maxDurationMinutes: 100_000, organizationId: 'o1' });
  expect((attendance.approveExtraTime.mock.calls[0] as any)[0].minutes).toBe(OVERTIME_CONSTANTS.MAX_OVERTIME_DURATION_MINUTES);
});

it('a signature approval carries the signature and keeps the leader’s name', async () => {
  const { service, attendance, prisma } = setup();
  prisma.overtimeRequest.findFirst.mockResolvedValue({ ...ROUND, technicianId: 'me' });
  await service.leaderApproveSignature({
    overtimeRequestId: 'ot1', approverId: 'leader', leaderName: 'Anna', leaderSignature: 'data:image/png;base64,AA',
    maxDurationMinutes: 60, userId: 'me', organizationId: 'o1',
  });
  expect((attendance.approveExtraTime.mock.calls[0] as any)[0]).toMatchObject({ entryId: 'entry-1', minutes: 60, signature: 'data:image/png;base64,AA' });
  expect(prisma.overtimeRequest.update).toHaveBeenCalledWith({ where: { id: 'ot1' }, data: { leaderName: 'Anna' } });
});
