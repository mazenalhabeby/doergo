import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../users.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Recording which build of the app a member runs.
 *
 * This exists because on 2026-08-31 a crash took out every Play Store user and
 * nobody could say who was affected or who still needed to update — there was
 * no version recorded anywhere. The nudge that followed had to go to everyone.
 *
 * It runs on the hot path: every authenticated request from every phone. So the
 * behaviour that matters is not "does it store the version" but "does it decline
 * to write when nothing changed", which is every request but the first after an
 * update. That guard lives in the WHERE clause, and these tests read it.
 *
 * The value arrives in a client-supplied header, so it is also checked here for
 * the shape and length it is allowed to have.
 */
describe('recordAppVersion', () => {
  let service: UsersService;

  const prisma: Record<string, any> = {
    user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };

  const argsOf = () => prisma.user.updateMany.mock.calls[0][0];

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: 'TASK_SERVICE', useValue: { emit: jest.fn() } },
        UsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  it('records a version, and says it did', async () => {
    const r = await service.recordAppVersion({ userId: 'u1', version: '1.0.3', platform: 'android' });
    expect(r).toEqual({ recorded: true });
    expect(argsOf().data).toMatchObject({ lastAppVersion: '1.0.3', lastAppPlatform: 'android' });
  });

  it('will not write when the version is unchanged — the whole point', async () => {
    await service.recordAppVersion({ userId: 'u1', version: '1.0.3' });
    // The guard is in the query, not in a prior read: one statement, no write
    // unless the stored value actually differs.
    expect(argsOf().where).toMatchObject({
      id: 'u1',
      OR: [{ lastAppVersion: { not: '1.0.3' } }, { lastAppVersion: null }],
    });
  });

  it('reports that nothing was written when the row already matched', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    expect(await service.recordAppVersion({ userId: 'u1', version: '1.0.3' })).toEqual({ recorded: false });
  });

  it('refuses anything that is not a version', async () => {
    for (const bad of ['', 'latest', 'v1', '../../etc', '1.0', 'DROP TABLE users']) {
      prisma.user.updateMany.mockClear();
      expect(await service.recordAppVersion({ userId: 'u1', version: bad })).toEqual({ recorded: false });
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    }
  });

  it('bounds the length of a header nobody controls', async () => {
    await service.recordAppVersion({ userId: 'u1', version: '1.0.3' + 'x'.repeat(500) });
    expect(argsOf().data.lastAppVersion.length).toBeLessThanOrEqual(32);
  });

  it('ignores a platform it does not recognise rather than storing it', async () => {
    await service.recordAppVersion({ userId: 'u1', version: '1.0.3', platform: 'windows' as any });
    expect(argsOf().data.lastAppPlatform).toBeUndefined();
  });

  it('never throws — bookkeeping must not fail a request', async () => {
    prisma.user.updateMany.mockRejectedValue(new Error('database is down'));
    await expect(service.recordAppVersion({ userId: 'u1', version: '1.0.3' })).resolves.toEqual({
      recorded: false,
    });
  });
});
