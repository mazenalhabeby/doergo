import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_IN_SPACE_KEY } from '@hbcfield/shared';
import { PendingProposalsQueryDto } from '../dto';
import { AssetsController } from '../assets.controller';

/**
 * GET /assets/proposals/pending?spaceId= — a workspace's Assets tab asking for
 * its OWN proposals.
 *
 * The global pipe runs with `forbidNonWhitelisted`, so a parameter the DTO does
 * not declare is a 400: without this DTO the tab's request would fail outright
 * rather than be ignored. And the value becomes a filter, so it is held to an
 * id's shape.
 */
const check = (query: Record<string, unknown>) =>
  validateSync(plainToInstance(PendingProposalsQueryDto, query), { whitelist: true, forbidNonWhitelisted: true });

describe('the pending-proposals query', () => {
  it('accepts no parameters — the org-wide queue', () => {
    expect(check({})).toEqual([]);
  });

  it('accepts a workspace id', () => {
    expect(check({ spaceId: 'clx9f2k3a0001qz8w1b2c3d4e' })).toEqual([]);
    expect(check({ spaceId: 'space_depot-1' })).toEqual([]);
  });

  it.each([
    ['empty', ''],
    ['too long', 'x'.repeat(65)],
    ['a filter expression', '{"in":["a","b"]}'],
    ['a path', '../other'],
    ['two values', ['a', 'b']],
  ])('refuses %s', (_label, spaceId) => {
    expect(check({ spaceId }).map((e) => e.property)).toContain('spaceId');
  });

  it('refuses anything else', () => {
    expect(check({ organizationId: 'org-2' }).map((e) => e.property)).toContain('organizationId');
  });
});

describe('the route', () => {
  const fn = (AssetsController.prototype as any).pendingProposals;

  it('still asks canManageAssets somewhere — the narrowing adds no door', () => {
    expect(new Reflector().get<string[]>(PERMISSIONS_IN_SPACE_KEY, fn)).toEqual(['canManageAssets']);
  });

  it('forwards the workspace alongside the caller’s own scope, never instead of it', async () => {
    const proposalPending = jest.fn(async (d: any) => d);
    const controller = new AssetsController({ proposalPending } as any, {} as any);
    const user = {
      id: 'u-lena', role: 'EMPLOYEE', organizationId: 'org1', canViewAllTasks: false,
      access: { org: {}, perSpace: { linz: { canManageAssets: true }, graz: { canManageAssets: true } } },
    };
    await controller.pendingProposals({ spaceId: 'linz' }, { user });
    expect(proposalPending).toHaveBeenCalledWith(expect.objectContaining({
      spaceId: 'linz',
      manageSpaceIds: ['linz', 'graz'],
      organizationId: 'org1',
    }));

    await controller.pendingProposals({}, { user });
    expect(proposalPending).toHaveBeenLastCalledWith(expect.objectContaining({ spaceId: undefined }));
  });
});
