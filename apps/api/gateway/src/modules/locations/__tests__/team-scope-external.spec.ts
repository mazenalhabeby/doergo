import { getSpaceScope } from '@hbcfield/shared';
import { LocationsController } from '../locations.controller';

/*
  GET /locations/team handed an external member the whole company — every
  member's name and workspace — because their Access Profile carried no
  spaceScope and the default is 'all'. An external member is never 'all'.
*/
describe('team list scope for an external member', () => {
  it('a profile with no spaceScope is "own" for an external member, "all" for staff', () => {
    expect(getSpaceScope({ enabledModules: { modules: ['tasks'] }, isExternal: true })).toBe('own');
    expect(getSpaceScope({ enabledModules: { modules: ['tasks'], spaceScope: 'all' }, isExternal: true })).toBe('own');
    expect(getSpaceScope({ enabledModules: { modules: ['tasks'], spaceScope: 'tasks' }, isExternal: true })).toBe('tasks');
    expect(getSpaceScope({ enabledModules: { modules: ['tasks'] } })).toBe('all');
  });

  it('the controller asks the service for "own" when an external member reads the team', async () => {
    const service: any = { getColleagues: jest.fn().mockResolvedValue([]) };
    const chatReach = { annotate: async (r: unknown) => r };
    const c = new (LocationsController as any)(service, undefined, undefined, undefined, undefined, chatReach);
    await c.getTeam({ user: { id: 'u', organizationId: 'o', isExternal: true, enabledModules: { modules: ['tasks'], platforms: 'both' } } });
    expect(service.getColleagues).toHaveBeenCalledWith(expect.objectContaining({ spaceScope: 'own' }));
  });
});
