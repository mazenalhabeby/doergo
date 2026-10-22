import { defaultHomeKeys, seedLayout } from '../default-home';

/*
  A new member's home: two widgets for their work, read off what they are
  entitled to. `enabledModules: null` = no Access Profile = every module.
*/
const member = (modules: string[] | null = null) => ({ role: 'EMPLOYEE', enabledModules: modules ? { modules } : null }) as never;
const ALL = ['shift-clock', 'my-work', 'crew', 'clients', 'shortcuts', 'my-route'];

describe('defaultHomeKeys', () => {
  it('a manager sees the crew and the jobs', () => {
    expect(defaultHomeKeys(member(), ALL)).toEqual(['crew', 'my-work']);
  });

  it('a sales rep sees the client book first, then the route', () => {
    expect(defaultHomeKeys(member(), ['shift-clock', 'my-work', 'clients', 'shortcuts', 'my-route'])).toEqual(['clients', 'my-route']);
  });

  it('a driver sees the clock and the stops for today', () => {
    expect(defaultHomeKeys(member(), ['shift-clock', 'my-work', 'shortcuts', 'my-route'])).toEqual(['shift-clock', 'my-route']);
  });

  it('an on-site worker sees the clock and the work', () => {
    expect(defaultHomeKeys(member(), ['shift-clock', 'my-work', 'shortcuts'])).toEqual(['shift-clock', 'my-work']);
  });

  it('never spends a slot on My work for somebody with no jobs and no clock', () => {
    expect(defaultHomeKeys(member(['documents']), ['my-work', 'shortcuts'])).toEqual(['shortcuts']);
  });

  it('fills a gap so two stays two', () => {
    expect(defaultHomeKeys(member(['tasks']), ['my-work', 'shortcuts'])).toEqual(['my-work', 'shortcuts']);
  });
});

describe('seedLayout', () => {
  it('shows the two and switches every other widget off, so a later change cannot bring them back', () => {
    expect(seedLayout(['crew', 'my-work'], ALL)).toEqual({
      keys: ['crew', 'my-work', 'shift-clock', 'clients', 'shortcuts', 'my-route'],
      hidden: ['shift-clock', 'clients', 'shortcuts', 'my-route'],
    });
  });
});
