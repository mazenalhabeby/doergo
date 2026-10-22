/**
 * The morning notice: a job's leader has approved time off today. Once per job
 * per day, from the local morning, to the leader's own routing and the job's
 * creator — never every admin.
 */
import { LeaderAbsentService } from '../sweeps/leader-absent.service';

describe('LeaderAbsentService.sweep', () => {
  const emit = jest.fn();
  let prisma: any;
  let service: LeaderAbsentService;
  const crew = { viewFor: jest.fn() };
  const routing = { resolveWatchers: jest.fn() };
  // 07:30 in Los Angeles on Thursday 1 October.
  const now = new Date('2026-10-01T14:30:00Z');

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      timeOff: { findMany: jest.fn().mockResolvedValue([{ technicianId: 'tobias', startDate: new Date('2026-10-01T00:00:00Z'), endDate: new Date('2026-10-02T00:00:00Z') }]) },
      task: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'job1', title: 'Install rooftop AC', organizationId: 'org1', assignedToId: 'tobias', createdById: 'anna', leadNoticeOn: null,
          space: { timezone: 'America/Los_Angeles' }, organization: { timezone: 'Europe/Vienna' }, assignedTo: { firstName: 'Tobias', lastName: 'Okafor' },
        }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      // The creator is told only when they are staff (not a portal client, not external).
      user: { findFirst: jest.fn().mockImplementation(async ({ where }: any) => (where.id === 'anna' ? { id: 'anna' } : null)) },
    };
    routing.resolveWatchers.mockResolvedValue({ ids: ['mara'], emails: [] });
    crew.viewFor.mockResolvedValue({ leader: { userId: 'priya', acting: true }, members: [{ user: { id: 'priya', firstName: 'Priya', lastName: 'Rhodes' } }] });
    service = new LeaderAbsentService(prisma, routing as any, crew as any, { emit } as any);
  });

  it('tells the leader\'s routing and the creator, naming the stand-in', async () => {
    await expect(service.sweep(now)).resolves.toBe(1);
    expect(prisma.task.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { leadNoticeOn: '2026-10-01' } }));
    expect(emit).toHaveBeenCalledWith('task_lead_needed', expect.objectContaining({ recipientIds: ['mara', 'anna'], leaderName: 'Tobias Okafor', actingName: 'Priya Rhodes' }));
  });

  it('once per day: already told today, nothing', async () => {
    prisma.task.findMany.mockResolvedValue([{ ...(await prisma.task.findMany())[0], leadNoticeOn: '2026-10-01' }]);
    await expect(service.sweep(now)).resolves.toBe(0);
    expect(emit).not.toHaveBeenCalled();
  });

  it('not before the local morning', async () => {
    await expect(service.sweep(new Date('2026-10-01T11:00:00Z'))).resolves.toBe(0); // 04:00 in LA
  });

  it('two replicas racing: the one that does not claim the day stays quiet', async () => {
    prisma.task.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.sweep(now)).resolves.toBe(0);
    expect(emit).not.toHaveBeenCalled();
  });

  it('leave that does not cover today where the work is: nothing', async () => {
    prisma.timeOff.findMany.mockResolvedValue([{ technicianId: 'tobias', startDate: new Date('2026-10-02T00:00:00Z'), endDate: new Date('2026-10-03T00:00:00Z') }]);
    await expect(service.sweep(now)).resolves.toBe(0);
  });

  it('a portal client who created the job never hears about staff leave', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await service.sweep(now);
    expect(emit).toHaveBeenCalledWith('task_lead_needed', expect.objectContaining({ recipientIds: ['mara'] }));
  });

  it('nobody routed and no creator: nobody is blasted', async () => {
    routing.resolveWatchers.mockResolvedValue({ ids: [], emails: [] });
    prisma.task.findMany.mockResolvedValue([{ ...(await prisma.task.findMany())[0], createdById: 'tobias' }]);
    await expect(service.sweep(now)).resolves.toBe(0);
  });
});
