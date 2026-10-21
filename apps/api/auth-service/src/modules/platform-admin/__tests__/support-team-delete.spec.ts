import { of, throwError } from 'rxjs';
import { PlatformSupportTeamsService } from '../platform-support-teams.service';

describe('deleting a support team — task-service clears its tickets first', () => {
  const prisma: any = {
    organization: { updateMany: jest.fn(() => 'org') },
    supportTeam: { delete: jest.fn(() => 'team') },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  beforeEach(() => jest.clearAllMocks());

  it('asks task-service, then deletes the team', async () => {
    const tasks: any = { send: jest.fn(() => of({ success: true, count: 3 })) };
    const r: any = await new PlatformSupportTeamsService(prisma, tasks).deleteTeam({ teamId: 't1' });
    expect(tasks.send).toHaveBeenCalledWith({ cmd: 'support.unassign_team' }, { teamId: 't1' });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(r.success).toBe(true);
  });

  it('deletes nothing when task-service cannot answer — no ticket points at a missing team', async () => {
    const tasks: any = { send: jest.fn(() => throwError(() => new Error('down'))) };
    const r: any = await new PlatformSupportTeamsService(prisma, tasks).deleteTeam({ teamId: 't1' });
    expect(r).toMatchObject({ success: false, statusCode: 503 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
