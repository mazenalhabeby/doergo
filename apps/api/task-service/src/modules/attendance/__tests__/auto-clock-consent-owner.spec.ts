import { of, throwError } from 'rxjs';
import { AutoClockService } from '../auto-clock/auto-clock.service';

/** The consent column lives on User, which auth-service owns: task-service decides, auth stores. */
describe('auto-clock consent is stored by auth-service', () => {
  const prisma: any = {
    user: {
      findFirst: jest.fn().mockResolvedValue({ id: 'u1', autoClockConsentAt: null, isExternal: false }),
      update: jest.fn(),
    },
  };
  beforeEach(() => jest.clearAllMocks());

  it('asks auth-service and never writes User itself', async () => {
    const auth: any = { send: jest.fn(() => of({ success: true })) };
    const r: any = await new AutoClockService(prisma, auth).setConsent({
      userId: 'u1',
      organizationId: 'o1',
      consent: true,
    });
    expect(auth.send.mock.calls[0][0]).toEqual({ cmd: 'user_set_auto_clock_consent' });
    expect(auth.send.mock.calls[0][1].userId).toBe('u1');
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(r.data.consentAt).toBeTruthy();
  });

  it('tells the member when the answer could not be kept', async () => {
    const auth: any = { send: jest.fn(() => throwError(() => new Error('down'))) };
    await expect(
      new AutoClockService(prisma, auth).setConsent({ userId: 'u1', organizationId: 'o1', consent: true }),
    ).rejects.toMatchObject({ status: 503 });
  });
});
