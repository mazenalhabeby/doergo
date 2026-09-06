import { Test } from '@nestjs/testing';
import { AttendanceService } from '../attendance.service';
import { CountedTimeService } from '../counted-time.service';
import { BreakRulesService } from '../break-rules.service';
import { ShiftResolverService } from '../shift-resolver.service';
import { NotificationRoutingService } from '../../../common/notification-routing.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SERVICE_NAMES, QUEUE_NAMES } from '@hbcfield/shared';
import { getQueueToken } from '@nestjs/bullmq';

/**
 * Who hears about a member's shift.
 *
 *   1. The WORKSPACE's own people — whoever holds the permission there.
 *   2. Failing that, the MEMBER's own watchers, from their Access page.
 *   3. Failing that, nobody.
 *
 * Step 3 replaced a fallback to every org ADMIN and everyone holding
 * `canManageUsers`. In a fifty-person organization that sent every late
 * departure, overtime request and no-show to the owner — the one person
 * guaranteed not to be running that shift. People learn to ignore a channel
 * like that, and then they miss the one that mattered.
 */
describe('who is told about a member’s shift', () => {
  let service: AttendanceService;
  let prisma: any;
  let emit: jest.Mock;
  let routing: { resolveWatchers: jest.Mock };

  const leader = (userId: string, perm: string) => ({
    userId,
    role: { isActive: true, permissions: { [perm]: true } },
  });

  const build = async () => {
    emit = jest.fn();
    routing = { resolveWatchers: jest.fn().mockResolvedValue({ ids: [], emails: [] }) };
    prisma = {
      timeEntry: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'e1', userId: 'worker', locationId: 'loc1', organizationId: 'org1',
          status: 'CLOCKED_IN', expectedClockOutAt: new Date(),
          location: { id: 'loc1', name: 'Warehouse' },
          user: { firstName: 'Mike', lastName: 'Weber' },
        }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      spaceAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      overtimeRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'ot1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([{ id: 'owner' }]) },
      $transaction: jest.fn((ops: any): Promise<any> => (Array.isArray(ops) ? Promise.all(ops) : ops(prisma))),
    };
    const mod = await Test.createTestingModule({
      providers: [
        AttendanceService, CountedTimeService, BreakRulesService,
        { provide: ShiftResolverService, useValue: { resolveForClockIn: jest.fn() } },
        { provide: NotificationRoutingService, useValue: routing },
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit } },
        { provide: getQueueToken(QUEUE_NAMES.OVERTIME), useValue: { add: jest.fn() } },
      ],
    }).compile();
    service = mod.get(AttendanceService);
  };

  const ask = () =>
    service.requestExtraTime({ userId: 'worker', entryId: 'e1', organizationId: 'org1' });
  const sentTo = () =>
    emit.mock.calls.find((c) => c[0] === 'attendance_overtime_request')?.[1]?.leaderIds;

  beforeEach(build);

  it('goes to the workspace’s own people when it has any', async () => {
    prisma.spaceAssignment.findMany.mockResolvedValue([
      leader('shift-leader', 'canApproveOvertime'),
      leader('someone-else', 'canViewAllTasks'), // holds a different permission
    ]);
    await ask();
    expect(sentTo()).toEqual(['shift-leader']);
    // The member's own routing is not even consulted…
    expect(routing.resolveWatchers).not.toHaveBeenCalled();
    // …and no org-wide sweep for owners happens.
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('falls to the member’s own watchers when the workspace has nobody', async () => {
    routing.resolveWatchers.mockResolvedValue({ ids: ['their-manager'], emails: [] });
    await ask();
    expect(sentTo()).toEqual(['their-manager']);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('tells NOBODY when neither exists — it does not fall to the owner', async () => {
    await ask();
    expect(sentTo()).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('asks about the RIGHT member — one person’s watchers are not reused for another', async () => {
    /*
      The escalation sweeps resolve the workspace half once per space and reuse
      it, which is correct because a site's leaders are the same for everybody
      there. The MEMBER half is not: reusing it would route everybody escalating
      at a leaderless site to whichever member the sweep happened to read first.
    */
    await ask();
    expect(routing.resolveWatchers).toHaveBeenCalledWith('worker', 'org1', 'attendance');
  });
});
