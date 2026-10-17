import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MemberOwnershipService } from '../member-ownership.service';

/**
 * Setting a member's phone home screen from the office.
 *
 * The rules that matter for security: scoped to the caller's organization,
 * never a portal customer, and nothing stored that the shared definition
 * does not recognise.
 */
describe('UsersService.setAssignedHome', () => {
  const prisma: any = { user: { findFirst: jest.fn(), update: jest.fn() } };
  // Member administration lives behind the UsersService facade.
  const service = new MemberOwnershipService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('looks the member up inside the caller’s organization, never a portal customer', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'm1' });
    await service.setAssignedHome({ memberId: 'm1', organizationId: 'org1', layout: { widgets: ['shift-clock'] } });
    const where = prisma.user.findFirst.mock.calls[0][0].where;
    expect(where).toEqual({ id: 'm1', organizationId: 'org1', role: { not: 'CUSTOMER' } });
  });

  it('is 404 for someone in another organization, and writes nothing', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      service.setAssignedHome({ memberId: 'x', organizationId: 'org1', layout: { widgets: ['crew'] } }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses an unknown widget or a malformed tile with a 400, and writes nothing', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'm1' });
    await expect(
      service.setAssignedHome({ memberId: 'm1', organizationId: 'org1', layout: { widgets: ['<script>'] } }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setAssignedHome({ memberId: 'm1', organizationId: 'org1', layout: { widgets: ['crew'], shortcuts: ['../../etc'] } }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('stores the validated value with a setAt, and null clears it', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'm1' });
    await service.setAssignedHome({
      memberId: 'm1', organizationId: 'org1',
      layout: { widgets: ['shift-clock', 'shortcuts'], shortcuts: ['shortcuts.documents'] },
    });
    const stored = prisma.user.update.mock.calls[0][0].data.assignedHome;
    expect(stored).toMatchObject({ widgets: ['shift-clock', 'shortcuts'], shortcuts: ['shortcuts.documents'] });
    expect(typeof stored.setAt).toBe('string');

    await service.setAssignedHome({ memberId: 'm1', organizationId: 'org1', layout: null });
    expect(prisma.user.update.mock.calls[1][0].data.assignedHome).toBe(Prisma.DbNull);
  });
});
