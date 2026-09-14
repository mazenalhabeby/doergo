import { Test } from '@nestjs/testing';
import { AttendanceService } from '../attendance.service';
import { CountedTimeService } from '../counted-time.service';
import { BreakRulesService } from '../break-rules.service';
import { ShiftResolverService } from '../shift-resolver.service';
import { NotificationRoutingService } from '../../../common/notification-routing.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SERVICE_NAMES, QUEUE_NAMES } from '@hbcfield/shared';
import { getQueueToken } from '@nestjs/bullmq';
import { PresenceService } from '../presence/presence.service';

/**
 * The list a member is offered must answer with the rule the clock-in refuses by.
 *
 * Looser and it offers a workspace the clock-in then rejects, which reads as the
 * product being broken. Stricter and it hides one that would have been accepted,
 * removing an option nobody can then find. The same discipline
 * `activeAssignmentWhere` already enforces for which workspaces appear at all.
 */
describe('clock-in list: where may this member work away', () => {
  let service: AttendanceService;
  let prisma: any;

  const SPACES = [
    { id: 'strict', name: 'Service Center', lat: 47.9, lng: 13.7, geofenceRadius: 40, geofencePolicy: 'STRICT', timezone: 'Europe/Vienna', address: null, isDefault: false },
    { id: 'open', name: 'Warehouse', lat: 47.9, lng: 13.8, geofenceRadius: 80, geofencePolicy: 'AWAY_ALLOWED', timezone: 'Europe/Vienna', address: null, isDefault: false },
    { id: 'nopin', name: 'Main Office', lat: null, lng: null, geofenceRadius: 15, geofencePolicy: 'STRICT', timezone: 'Europe/Vienna', address: null, isDefault: true },
  ];

  const build = async (member: { allowRemote?: boolean; role?: string }, overrides: Record<string, boolean | null>) => {
    prisma = {
      spaceAssignment: {
        findMany: jest.fn().mockResolvedValue(
          SPACES.map((s) => ({ spaceId: s.id, allowRemote: overrides[s.id] ?? null })),
        ),
      },
      companyLocation: { findMany: jest.fn().mockResolvedValue(SPACES) },
      user: { findFirst: jest.fn().mockResolvedValue({ allowRemote: false, role: 'EMPLOYEE', ...member }) },
    };
    const mod = await Test.createTestingModule({
      providers: [
        AttendanceService, { provide: PresenceService, useValue: { atClockIn: jest.fn().mockResolvedValue({}), onPosition: jest.fn().mockResolvedValue(undefined), onBatch: jest.fn().mockResolvedValue(undefined) } }, CountedTimeService, BreakRulesService,
        { provide: ShiftResolverService, useValue: {} },
        { provide: NotificationRoutingService, useValue: {} },
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.OVERTIME), useValue: { add: jest.fn() } },
      ],
    }).compile();
    service = mod.get(AttendanceService);
    const res: any = await service.listClockInLocations({ userId: 'u1', organizationId: 'org1' });
    return Object.fromEntries(res.data.map((l: any) => [l.id, l.awayAllowed]));
  };

  it('marks a strict site as never away-able, however the member is granted', async () => {
    expect(await build({ allowRemote: true }, {})).toMatchObject({ strict: false });
  });

  it('marks a permitting site away-able only for a granted member', async () => {
    expect(await build({ allowRemote: true }, {})).toMatchObject({ open: true });
    expect(await build({ allowRemote: false }, {})).toMatchObject({ open: false });
  });

  it('applies the per-workspace override to that workspace ALONE', async () => {
    // Granted on the account, refused at the Warehouse specifically. The strict
    // site is unaffected and stays refused for its own reason.
    const r = await build({ allowRemote: true }, { open: false });
    expect(r).toMatchObject({ open: false, strict: false });
  });

  it('does NOT mark a pin-less workspace away-able — there is nothing to be away from', async () => {
    /*
      Narrower than the clock-in's own answer, on purpose. A pin-less workspace
      refuses nobody, but "away" there changes nothing: the ordinary clock-in
      already does the same thing. Reporting it as away-able puts an "Away from
      the site" button in front of somebody for whom it is a no-op.
    */
    expect(await build({ allowRemote: true }, {})).toMatchObject({ nopin: false });
  });

  it('lets an administrator away without an explicit grant, but not past a strict site', async () => {
    const r = await build({ role: 'ADMIN', allowRemote: false }, {});
    expect(r).toMatchObject({ open: true, strict: false });
  });

  it('still returns every assigned workspace — the flag informs the UI, it does not filter here', async () => {
    // Filtering server-side would leave the ON-SITE picker missing workspaces
    // the member can perfectly well stand in.
    const r = await build({ allowRemote: false }, {});
    expect(Object.keys(r).sort()).toEqual(['nopin', 'open', 'strict']);
  });
});
