import { HttpStatus } from '@nestjs/common';
import { Role } from '@hbcfield/shared';
import { onboardingServices, type OnboardingServiceParts } from './onboarding.service.fixture';
import { claimInvitation, InvitationAlreadyClaimedError } from '../../invitations/invitation-apply';

/*
  Approving a join request IS inviting somebody, after the fact — so it asks
  the invitation's rule. The DTO accepts ADMIN and the route asks only
  `canManageUsers`: before this, a manager approved a second account of their
  own as ADMIN and held the whole organization (security audit 2026-10-09).
*/
describe('join-request approval', () => {
  const ORG = 'org-1';
  const people: Record<string, any> = {
    admin: { id: 'admin', role: Role.ADMIN, organizationId: ORG, memberRole: null },
    manager: { id: 'manager', role: Role.EMPLOYEE, organizationId: ORG, canManageUsers: true, memberRole: null },
  };

  const tx: Record<string, any> = {
    joinRequest: { updateMany: jest.fn() },
    user: { update: jest.fn().mockResolvedValue({ id: 'joiner' }) },
  };
  const prisma: Record<string, any> = {
    joinRequest: {
      findUnique: jest.fn().mockResolvedValue({ id: 'jr-1', organizationId: ORG, status: 'PENDING', userId: 'joiner', user: {} }),
    },
    user: { findFirst: jest.fn(({ where }: any) => Promise.resolve(people[where.id] ?? null)) },
    $transaction: jest.fn((cb: any) => cb(tx)),
  };
  const billing = { scheduleReconcile: jest.fn() };
  const service = onboardingServices(prisma as any, billing as any, { emit: jest.fn() } as any);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.joinRequest.updateMany.mockResolvedValue({ count: 1 });
  });

  const approve = (approverId: string, role: string) =>
    service.approveJoinRequest({ requestId: 'jr-1', organizationId: ORG, approverId, role });

  it('a manager cannot approve somebody as ADMIN', async () => {
    const r: any = await approve('manager', Role.ADMIN);
    expect(r.success).toBe(false);
    expect(r.statusCode).toBe(HttpStatus.FORBIDDEN);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('a manager may approve somebody as EMPLOYEE', async () => {
    const r: any = await approve('manager', Role.EMPLOYEE);
    expect(r.success).toBe(true);
  });

  it('an approved member is a seat: the bill is re-synced', async () => {
    // Before this the seat waited for the next unrelated member change.
    const r: any = await approve('admin', Role.EMPLOYEE);
    expect(r.success).toBe(true);
    expect(billing.scheduleReconcile).toHaveBeenCalledWith(ORG);
  });

  it('a lost claim adds nobody and re-bills nothing', async () => {
    tx.joinRequest.updateMany.mockResolvedValue({ count: 0 });
    await approve('admin', Role.EMPLOYEE);
    expect(billing.scheduleReconcile).not.toHaveBeenCalled();
  });

  it('an admin may approve somebody as ADMIN', async () => {
    const r: any = await approve('admin', Role.ADMIN);
    expect(r.success).toBe(true);
  });

  it('two approvals of one request: the loser of the claim changes nobody', async () => {
    tx.joinRequest.updateMany.mockResolvedValue({ count: 0 });
    const r: any = await approve('admin', Role.EMPLOYEE);
    expect(r.success).toBe(false);
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});

describe('claimInvitation — one code, one account', () => {
  it('throws (rolling the accept back) when the invitation is no longer PENDING', async () => {
    const tx = { invitation: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    await expect(claimInvitation(tx, 'inv-1', 'u-1')).rejects.toBeInstanceOf(InvitationAlreadyClaimedError);
    expect(tx.invitation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'inv-1', status: 'PENDING' }),
    }));
  });

  it('claims it when it is', async () => {
    const tx = { invitation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    await expect(claimInvitation(tx, 'inv-1', 'u-1')).resolves.toBeUndefined();
  });
});
