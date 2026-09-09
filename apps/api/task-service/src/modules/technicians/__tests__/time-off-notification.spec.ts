import { Test } from '@nestjs/testing';
import { TechniciansService } from '../technicians.service';
import { NotificationRoutingService } from '../../../common/notification-routing.service';
import { CoverService } from '../cover.service';
import { PrismaService, SERVICE_NAMES } from '@hbcfield/shared';

/**
 * Who is told when somebody asks for days off.
 *
 * The answer is not invented here. It is the SAME resolver that decides who
 * hears about that person's shifts — their Access-page watchers, union the
 * routing configured on the spaces they work in — and this suite exists to pin
 * three properties of using it:
 *
 *   1. the request goes to exactly whom the resolver named;
 *   2. nothing configured anywhere → NOBODY is told, with no fallback to the
 *      org's admins (that fallback is the one this product deliberately does
 *      not have, and re-adding it here would reintroduce it by the back door);
 *   3. the decision goes back to the person who asked, always.
 *
 * Before this existed a leave request wrote a PENDING row and notified no one:
 * the only way it was ever seen was somebody opening the availability calendar.
 */
describe('who is told about a leave request', () => {
  let service: TechniciansService;
  let prisma: any;
  let emit: jest.Mock;
  let routing: { resolveWatchers: jest.Mock };
  let cover: { assessMany: jest.Mock };

  const future = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString();
  };

  beforeEach(async () => {
    emit = jest.fn();
    routing = { resolveWatchers: jest.fn().mockResolvedValue({ ids: [], emails: [] }) };
    cover = { assessMany: jest.fn().mockResolvedValue(new Map()) };
    prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'mike', organizationId: 'org1' }) },
      timeOff: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({
          id: 'to1',
          status: 'PENDING',
          technicianId: 'mike',
          technician: { organizationId: 'org1', spaceAssignments: [] },
        }),
        create: jest.fn().mockResolvedValue({
          id: 'to1',
          technician: { id: 'mike', firstName: 'Mike', lastName: 'Weber' },
        }),
        update: jest.fn().mockResolvedValue({
          id: 'to1',
          technicianId: 'mike',
          startDate: new Date('2026-10-01'),
          endDate: new Date('2026-10-05'),
        }),
      },
    };
    const mod = await Test.createTestingModule({
      providers: [
        TechniciansService,
        { provide: NotificationRoutingService, useValue: routing },
        { provide: CoverService, useValue: cover },
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit } },
      ],
    }).compile();
    service = mod.get(TechniciansService);
  });

  const ask = () =>
    service.requestTimeOff({
      technicianId: 'mike',
      organizationId: 'org1',
      startDate: future(10),
      endDate: future(14),
    } as never);

  const requested = () =>
    emit.mock.calls.find((c) => c[0] === 'time_off_requested')?.[1];

  it('goes to whoever the member’s routing names', async () => {
    routing.resolveWatchers.mockResolvedValue({ ids: ['anna', 'boss'], emails: [] });
    await ask();
    expect(requested()?.recipientIds).toEqual(['anna', 'boss']);
  });

  it('asks under the attendance category, about the member who asked', async () => {
    await ask();
    expect(routing.resolveWatchers).toHaveBeenCalledWith('mike', 'org1', 'attendance');
  });

  it('tells NOBODY when nothing is configured — no fallback to the org’s admins', async () => {
    routing.resolveWatchers.mockResolvedValue({ ids: [], emails: [] });
    await ask();
    expect(requested()).toBeUndefined();
    expect(prisma.timeOff.create).toHaveBeenCalled(); // the request is still filed
  });

  it('answers the person who asked, and names the refusal’s reason', async () => {
    await service.approveTimeOff({
      timeOffId: 'to1',
      organizationId: 'org1',
      approverId: 'anna',
      approved: false,
      rejectionReason: 'Two others are already off that week',
    } as never);
    const decided = emit.mock.calls.find((c) => c[0] === 'time_off_decided')?.[1];
    expect(decided).toMatchObject({
      memberId: 'mike',
      approved: false,
      rejectionReason: 'Two others are already off that week',
      startDate: '2026-10-01',
      endDate: '2026-10-05',
    });
  });
});
