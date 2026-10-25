import { SessionEvents } from '../../../common/session-events/session-events.service';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../users.service';
import { USERS_SERVICES } from '../users-services';
import { PrismaService } from '@hbcfield/shared';

/**
 * An administrator switching their own clock off (clock review A7). What matters is what is REFUSED:
 * anybody who is not an admin (their clock is their access profile, set by the office), and switching
 * it off with a shift still running — the clock would vanish over an open shift.
 */
describe('updateOwnProfile — usesClock', () => {
  let service: UsersService;
  const prisma: Record<string, any> = {
    user: { update: jest.fn().mockResolvedValue({ id: 'u1' }), findUnique: jest.fn() },
    timeEntry: { count: jest.fn() },
  };
  const taskClient = { emit: jest.fn() };
  const dataOf = () => prisma.user.update.mock.calls[0][0].data;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.timeEntry.count.mockResolvedValue(0);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: SessionEvents, useValue: { sessionsRevoked: jest.fn(), organizationSuspended: jest.fn() } },
        { provide: 'TASK_SERVICE', useValue: taskClient },
        ...USERS_SERVICES,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  it('an admin switches it off: stored, and their shifts still ahead are no longer expected', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
    prisma.user.update.mockResolvedValue({ id: 'u1', organizationId: 'o1' });
    await service.updateOwnProfile('u1', { usesClock: false });
    expect(dataOf()).toEqual({ clockOff: true });
    // The rota's expected shifts are task-service's: it is told, it drops them.
    const [pattern, payload] = taskClient.emit.mock.calls[0];
    expect(pattern).toBe('member_clock_switched');
    expect(payload).toEqual({ organizationId: 'o1', userId: 'u1', clockOff: true });
  });

  it('an admin switches it back on, nothing else touched', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
    await service.updateOwnProfile('u1', { usesClock: true });
    expect(dataOf()).toEqual({ clockOff: false });
  });

  it('refused for anyone who is not an admin', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: 'EMPLOYEE' });
    await expect(service.updateOwnProfile('u1', { usesClock: false })).rejects.toMatchObject({
      response: { code: 'CLOCK_SWITCH_ADMIN_ONLY' },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refused while a shift is running', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
    prisma.timeEntry.count.mockResolvedValue(1);
    await expect(service.updateOwnProfile('u1', { usesClock: false })).rejects.toMatchObject({
      response: { code: 'CLOCK_SWITCH_WHILE_CLOCKED_IN' },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
