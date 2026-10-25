import { Test } from '@nestjs/testing';
import { AttendanceService } from '../attendance.service';
import { ATTENDANCE_SERVICE_PARTS } from '../attendance-service-parts';
import { CountedTimeService } from '../core/counted-time.service';
import { BreakRulesService } from '../core/break-rules.service';
import { ShiftResolverService } from '../core/shift-resolver.service';
import { NotificationRoutingService } from '../../notification-routing/notification-routing.service';
import { PrismaService } from '@hbcfield/shared';
import { SERVICE_NAMES, QUEUE_NAMES } from '@hbcfield/shared';
import { getQueueToken } from '@nestjs/bullmq';
import { PresenceService } from '../presence/presence.service';
import { ApprovalRouteService } from '../../approvals/rules/approval-route.service';

/**
 * Who hears about a member asking for more time (the `extraTime` audience).
 *
 *   1. The WORKSPACE's own deciders (and today's stand-ins) — never anybody on leave.
 *   2. Failing that, the MEMBER's own watchers, from their Access page.
 *   3. Failing that, nobody — a member's own request is never padded with admins (the own-request rule
 *      sends a LEADER's own to the administrators itself). Alerts that need somebody (the `attendance`
 *      audience) do go on to org-wide deciders and admins: see attendance-routing-tiers.spec.
 */
describe('who is told about a member’s shift', () => {
  let service: AttendanceService;
  let prisma: any;
  let emit: jest.Mock;
  let routing: { resolveWatchers: jest.Mock };

  const decider = (id: string, via: string, onLeave = false) => ({
    id,
    name: id,
    avatarUrl: null,
    via,
    onLeave,
    covers: [],
  });
  let deciders: { workspaceDeciders: jest.Mock };

  const build = async () => {
    emit = jest.fn();
    routing = { resolveWatchers: jest.fn().mockResolvedValue({ ids: [], emails: [] }) };
    deciders = { workspaceDeciders: jest.fn().mockResolvedValue([decider('owner', 'ADMIN')]) };
    prisma = {
      timeEntry: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'e1',
          userId: 'worker',
          locationId: 'loc1',
          organizationId: 'org1',
          status: 'CLOCKED_IN',
          expectedClockOutAt: new Date(),
          location: { id: 'loc1', name: 'Warehouse' },
          user: { firstName: 'Mike', lastName: 'Weber' },
        }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
        AttendanceService,
        ...ATTENDANCE_SERVICE_PARTS,
        {
          provide: PresenceService,
          useValue: {
            atClockIn: jest.fn().mockResolvedValue({}),
            onPosition: jest.fn().mockResolvedValue(undefined),
            onBatch: jest.fn().mockResolvedValue(undefined),
          },
        },
        CountedTimeService,
        BreakRulesService,
        { provide: ShiftResolverService, useValue: { resolveForClockIn: jest.fn() } },
        { provide: NotificationRoutingService, useValue: routing },
        { provide: ApprovalRouteService, useValue: deciders },
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit } },
        { provide: getQueueToken(QUEUE_NAMES.OVERTIME), useValue: { add: jest.fn() } },
      ],
    }).compile();
    service = mod.get(AttendanceService);
  };

  const ask = () => service.requestExtraTime({ userId: 'worker', entryId: 'e1', organizationId: 'org1' });
  const sentTo = () => emit.mock.calls.find((c) => c[0] === 'attendance_overtime_request')?.[1]?.leaderIds;

  beforeEach(build);

  it('goes to the workspace’s own people when it has any', async () => {
    deciders.workspaceDeciders.mockResolvedValue([
      decider('shift-leader', 'SPACE'),
      decider('on-holiday', 'SPACE', true), // on leave today: not told
      decider('owner', 'ADMIN'),
    ]);
    await ask();
    expect(sentTo()).toEqual(['shift-leader']);
    expect(deciders.workspaceDeciders).toHaveBeenCalledWith('org1', 'loc1', ['extraTime']);
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

  it('tells NOBODY when neither exists — a member’s own request does not fall to the owner', async () => {
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
