import { InvitationService } from '../invitation.service';

/*
  Accepting an invitation adds a seat, so the bill is re-synced at once.

  Before this the new member waited, unbilled, for the next unrelated member
  change — the gateway's re-bill hooks never see a public accept.
*/
describe('accepting an invitation re-bills the seat', () => {
  const make = (claimed: boolean) => {
    const prisma: any = {
      invitation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'inv-1', status: 'PENDING', expiresAt: new Date(Date.now() + 86_400_000),
          organizationId: 'org-1', organization: { isActive: true }, targetRole: 'EMPLOYEE',
          createdById: 'admin',
        }),
      },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      // The transaction body is covered elsewhere; here it either claims or loses.
      $transaction: jest.fn().mockReturnValue(Promise.resolve(claimed ? { id: 'u-new' } : null)),
    };
    const billing = { scheduleReconcile: jest.fn() };
    const svc = new InvitationService(prisma, { emit: jest.fn() } as any, {} as any, billing as any);
    jest.spyOn(svc as any, 'issueJoiningContract').mockResolvedValue(undefined);
    return { svc, billing };
  };
  const accept = (svc: InvitationService) =>
    svc.acceptInvitation({ code: 'ABCDEFGHJK', email: 'new@x.test', password: 'Password123!', firstName: 'N', lastName: 'M' });

  it('schedules the reconcile for the organization joined', async () => {
    const { svc, billing } = make(true);
    const r: any = await accept(svc);
    expect(r.success).toBe(true);
    expect(billing.scheduleReconcile).toHaveBeenCalledWith('org-1');
  });

  it('a lost claim adds nobody and re-bills nothing', async () => {
    const { svc, billing } = make(false);
    await accept(svc);
    expect(billing.scheduleReconcile).not.toHaveBeenCalled();
  });
});
