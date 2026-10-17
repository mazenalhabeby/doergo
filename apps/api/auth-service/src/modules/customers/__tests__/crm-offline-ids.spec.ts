/**
 * A client or activity added by a sales rep from the phone is created once.
 */
import { crmReachOrgOnly } from '@hbcfield/shared';
import { customerServices, type CustomerServices } from './customer-services.fixture';

function withDeps(deps: Record<string, unknown>): CustomerServices {
  return customerServices(deps.prisma);
}

describe('CRM records named by the phone', () => {
  it('returns the client a resend already made', async () => {
    const prisma: any = { customer: { findUnique: jest.fn(async () => ({ id: 'client-phone-0000001', organizationId: 'o1', name: 'BILLA AG' })), create: jest.fn() } };
    const svc = withDeps({ prisma });
    (svc as any).crmReachFor = async () => crmReachOrgOnly({ view: 'all', work: true, editInfo: true, create: true, manage: true, canAccess: true });
    const res: any = await svc.create('o1', { id: 'client-phone-0000001', name: 'BILLA AG' }, { userId: 'u1' });
    expect(res.data.id).toBe('client-phone-0000001');
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });

  it('never stores an id that is not a phone id, and refuses another organization’s', async () => {
    const created: any[] = [];
    const prisma: any = { customer: { findUnique: jest.fn(async () => ({ id: 'x', organizationId: 'other-org' })), create: jest.fn(async (a: any) => { created.push(a.data); return a.data; }) } };
    const svc = withDeps({ prisma });
    (svc as any).crmReachFor = async () => crmReachOrgOnly({ view: 'all', work: true, editInfo: true, create: true, manage: true, canAccess: true });
    (svc as any).assertRefsInOrg = async () => undefined;
    (svc as any).keepOrgUserIds = async (ids: string[]) => ids;
    await svc.create('o1', { id: "'; drop", name: 'A' }, { userId: 'u1' });
    expect(created[0]).not.toHaveProperty('id');
    await expect(svc.create('o1', { id: 'client-phone-0000001', name: 'B' }, { userId: 'u1' })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'ID_IN_USE' }) });
  });

  it('logs an activity once, after the reach check', async () => {
    const reach = jest.fn();
    const prisma: any = { customerActivity: { findUnique: jest.fn(async () => ({ id: 'act-phone-00000001', customerId: 'c1', authorId: 'u1' })), create: jest.fn() } };
    const svc = withDeps({ prisma });
    (svc as any).assertCrmReach = reach;
    const res: any = await svc.addActivity({ clientId: 'act-phone-00000001', customerId: 'c1', organizationId: 'o1', authorId: 'u1', body: 'Called' });
    expect(reach).toHaveBeenCalled();
    expect(res.data.id).toBe('act-phone-00000001');
    expect(prisma.customerActivity.create).not.toHaveBeenCalled();
  });
});
