import { jobsUnderwayFor } from '../jobs';
import { memberInScope as inScope } from '../members';

describe('published readers keep the scope rule: undefined = org-wide, [] = nothing, [ids] = those', () => {
  const task = { findMany: jest.fn().mockResolvedValue([]) };

  it('jobsUnderwayFor narrows by workspace only when a scope is given', async () => {
    await jobsUnderwayFor({ task } as any, ['w1']);
    expect(task.findMany.mock.calls[0][0].where.spaceId).toBeUndefined();
    await jobsUnderwayFor({ task } as any, ['w1'], []);
    expect(task.findMany.mock.calls[1][0].where.spaceId).toEqual({ in: [] });
  });

  it('memberInScope answers a yes/no and never returns the row', async () => {
    const user = { findFirst: jest.fn().mockResolvedValueOnce({ id: 'u1' }).mockResolvedValueOnce(null) };
    expect(await inScope({ user } as any, 'u1', 'o1', undefined)).toBe(true);
    expect(await inScope({ user } as any, 'u2', 'o1', undefined)).toBe(false);
    expect(user.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'u1', organizationId: 'o1' });
  });
});
