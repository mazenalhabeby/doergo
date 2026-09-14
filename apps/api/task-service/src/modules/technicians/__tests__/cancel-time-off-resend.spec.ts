/**
 * Cancelling time off, sent again by a phone that had no signal.
 */
import { TechniciansService } from '../technicians.service';

function service(status: string) {
  const svc = Object.create(TechniciansService.prototype) as any;
  svc.prisma = {
    timeOff: {
      findUnique: jest.fn().mockResolvedValue({ id: 'to-1', technicianId: 'u1', status }),
      update: jest.fn(async ({ data }: any) => ({ id: 'to-1', technicianId: 'u1', ...data })),
    },
  };
  return svc;
}

describe('cancelling time off', () => {
  it('cancels a pending request', async () => {
    const svc = service('PENDING');
    const res = await svc.cancelTimeOff({ timeOffId: 'to-1', technicianId: 'u1' });
    expect(res.data.status).toBe('CANCELED');
  });

  it('answers a resend with the same result instead of a refusal', async () => {
    const svc = service('CANCELED');
    const res = await svc.cancelTimeOff({ timeOffId: 'to-1', technicianId: 'u1' });
    expect(res.data.status).toBe('CANCELED');
    expect(svc.prisma.timeOff.update).not.toHaveBeenCalled();
  });

  it('refuses a decided request with a code the phone can put in words', async () => {
    const svc = service('APPROVED');
    await expect(svc.cancelTimeOff({ timeOffId: 'to-1', technicianId: 'u1' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'TIME_OFF_DECIDED' }),
    });
  });

  it('never cancels somebody else’s', async () => {
    const svc = service('PENDING');
    await expect(svc.cancelTimeOff({ timeOffId: 'to-1', technicianId: 'someone-else' })).rejects.toBeDefined();
  });
});
