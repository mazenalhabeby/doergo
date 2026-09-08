import { splitTabs, MAX_TABS, TAB_PRIORITY } from '../tab-layout';

/**
 * How many tabs the bar shows, and which ones.
 *
 * Tabs are granted by the Access Profile, so the count is not a design choice:
 * an admin who also works a site legitimately qualifies for seven. Seven across
 * a phone gives each about 53px — labels shrink past reading and touch targets
 * fall under the 44px every platform asks for.
 */
const r = (...names: string[]) => names.map((name) => ({ name }));
const names = (list: { name: string }[]) => list.map((x) => x.name);

describe('the tab bar never exceeds five', () => {
  it('shows everything when it fits, with no More at all', () => {
    // The common case: most members hold three or four tabs and must never see
    // an overflow entry that has nothing behind it.
    const { barRoutes, overflowRoutes } = splitTabs(r('index', 'tasks', 'attendance'));
    expect(names(barRoutes)).toEqual(['index', 'tasks', 'attendance']);
    expect(overflowRoutes).toEqual([]);
  });

  it('shows exactly five without overflowing', () => {
    const five = r('index', 'tasks', 'attendance', 'create-task', 'manage');
    const { barRoutes, overflowRoutes } = splitTabs(five);
    expect(barRoutes).toHaveLength(5);
    expect(overflowRoutes).toEqual([]);
  });

  it('never renders more than five slots, More included', () => {
    // The invariant the whole thing exists for.
    for (let n = 1; n <= TAB_PRIORITY.length; n++) {
      const { barRoutes, overflowRoutes } = splitTabs(r(...TAB_PRIORITY.slice(0, n)));
      const slots = barRoutes.length + (overflowRoutes.length > 0 ? 1 : 0);
      expect(slots).toBeLessThanOrEqual(MAX_TABS);
    }
  });

  it('keeps the everyday four and moves the occasional ones', () => {
    // An admin who also works a site: seven tabs.
    const { barRoutes, overflowRoutes } = splitTabs(
      r('team', 'time-off', 'manage', 'create-task', 'attendance', 'tasks', 'index'),
    );
    expect(names(barRoutes)).toEqual(['index', 'tasks', 'attendance', 'create-task']);
    expect(names(overflowRoutes)).toEqual(['manage', 'time-off', 'team']);
  });

  it('orders by priority, not by the order routes happen to arrive in', () => {
    // React Navigation's route order follows file layout, which is alphabetical
    // and says nothing about what a member opens all day.
    const { barRoutes } = splitTabs(r('time-off', 'team', 'tasks', 'manage', 'index', 'create-task'));
    expect(names(barRoutes)[0]).toBe('index');
    expect(names(barRoutes)).toContain('tasks');
  });

  it('loses nothing — every tab is either in the bar or behind More', () => {
    const all = r(...TAB_PRIORITY);
    const { barRoutes, overflowRoutes } = splitTabs(all);
    expect([...names(barRoutes), ...names(overflowRoutes)].sort()).toEqual(names(all).sort());
  });

  it('puts an unknown route last rather than at the front', () => {
    // A tab added later without a priority entry must not displace Home.
    const { barRoutes, overflowRoutes } = splitTabs(
      r('index', 'tasks', 'attendance', 'create-task', 'manage', 'brand-new'),
    );
    expect(names(barRoutes)[0]).toBe('index');
    expect(names(overflowRoutes)).toContain('brand-new');
  });
});
