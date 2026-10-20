import { NotFoundException } from '@nestjs/common';
import { SpaceReadService } from '../space-read.service';

/**
 * GET /locations/:id answered anybody in the organization with the whole
 * record: the client's contact person and the workspace's rates included, for
 * a workspace the caller could not even see in the list.
 *
 *   • `viewScopeSpaceIds` — outside it is 404, like a workspace that does not exist.
 *   • `mayManage: false` — contact fields and rates are removed (stripWorkspaceTerms).
 */
describe('SpaceReadService.findOne — scope and client terms', () => {
  const row = {
    id: 'ws-1',
    organizationId: 'org-1',
    name: 'BILLA',
    currency: null,
    contactName: 'Frau Huber',
    contactEmail: 'h@billa.at',
    contactPhone: '+43',
    billableRateCents: 9000,
    costRateCents: 4000,
  };
  const prisma: any = {
    companyLocation: { findFirst: jest.fn().mockResolvedValue(row) },
    rateHistory: { count: jest.fn().mockResolvedValue(2) },
    organization: { findUnique: jest.fn().mockResolvedValue({ currency: 'EUR' }) },
  };
  const svc = new SpaceReadService(prisma, { emit: jest.fn() } as any);
  beforeEach(() => jest.clearAllMocks());

  it('404s a workspace outside the caller’s view scope without reading it', async () => {
    await expect(
      svc.findOne({ id: 'ws-1', organizationId: 'org-1', viewScopeSpaceIds: ['ws-2'] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.companyLocation.findFirst).not.toHaveBeenCalled();
  });

  it('an empty scope sees none', async () => {
    await expect(svc.findOne({ id: 'ws-1', organizationId: 'org-1', viewScopeSpaceIds: [] })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('strips the client contact and the rates for somebody who does not manage it', async () => {
    const res: any = await svc.findOne({
      id: 'ws-1',
      organizationId: 'org-1',
      viewScopeSpaceIds: ['ws-1'],
      mayManage: false,
    });
    for (const k of ['contactName', 'contactEmail', 'contactPhone', 'billableRateCents', 'costRateCents']) {
      expect(res.data).not.toHaveProperty(k);
    }
    expect(res.data).toMatchObject({ id: 'ws-1', name: 'BILLA', ratesSet: 2 });
  });

  it('keeps them for a manager, and for a legacy caller that sends neither field', async () => {
    const managed: any = await svc.findOne({ id: 'ws-1', organizationId: 'org-1', mayManage: true });
    expect(managed.data).toMatchObject({ contactName: 'Frau Huber', billableRateCents: 9000 });
    const legacy: any = await svc.findOne({ id: 'ws-1', organizationId: 'org-1' });
    expect(legacy.data).toMatchObject({ contactEmail: 'h@billa.at' });
  });

  it('a space shared IN from another organization is reached through the share, and its client terms are stripped', async () => {
    const res: any = await svc.findOne({
      id: 'ws-1',
      organizationId: 'guest-org',
      sharedSpaceIds: ['ws-1'],
      viewScopeSpaceIds: [],
    });
    expect(res.data).not.toHaveProperty('contactName');
  });
});
