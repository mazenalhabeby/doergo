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
    // The common case: a field member holds three or four tabs and no
    // management rows, and must never see a More entry with nothing behind it.
    const { barRoutes, overflowRoutes, showMore } = splitTabs(r('index', 'tasks', 'attendance'));
    expect(names(barRoutes)).toEqual(['index', 'tasks', 'attendance']);
    expect(overflowRoutes).toEqual([]);
    expect(showMore).toBe(false);
  });

  /*
    ⚠️ The case that would silently orphan screens. A supervisor can hold five
    or fewer tabs and still have management rows — and four of those screens
    have no other door anywhere in the app. Without More they are unreachable.
  */
  it('shows More for management rows even when the tabs fit', () => {
    const { barRoutes, showMore } = splitTabs(r('index', 'attendance'), true);
    expect(showMore).toBe(true);
    expect(barRoutes.length).toBeLessThanOrEqual(MAX_TABS - 1);
  });

  it('does not offer Manage as a tab any more', () => {
    expect(TAB_PRIORITY).not.toContain('manage');
  });

  it('shows exactly five without overflowing', () => {
    const five = r('index', 'tasks', 'attendance', 'create-task', 'time-off');
    const { barRoutes, overflowRoutes } = splitTabs(five);
    expect(barRoutes).toHaveLength(5);
    expect(overflowRoutes).toEqual([]);
  });

  it('never renders more than five slots, More included', () => {
    // The invariant the whole thing exists for.
    for (let n = 1; n <= TAB_PRIORITY.length; n++) {
      for (const extras of [false, true]) {
        const { barRoutes, showMore } = splitTabs(r(...TAB_PRIORITY.slice(0, n)), extras);
        expect(barRoutes.length + (showMore ? 1 : 0)).toBeLessThanOrEqual(MAX_TABS);
      }
    }
  });

  it('keeps the everyday four and moves the occasional ones', () => {
    // An admin who also works a site: seven tabs.
    const { barRoutes, overflowRoutes } = splitTabs(
      r('team', 'time-off', 'create-task', 'attendance', 'tasks', 'index'),
      true, // an admin also has the management rows
    );
    expect(names(barRoutes)).toEqual(['index', 'tasks', 'attendance', 'create-task']);
    expect(names(overflowRoutes)).toEqual(['time-off', 'team']);
  });

  it('orders by priority, not by the order routes happen to arrive in', () => {
    // React Navigation's route order follows file layout, which is alphabetical
    // and says nothing about what a member opens all day.
    const { barRoutes } = splitTabs(r('time-off', 'team', 'tasks', 'attendance', 'index', 'create-task'));
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
      r('index', 'tasks', 'attendance', 'create-task', 'time-off', 'brand-new'),
    );
    expect(names(barRoutes)[0]).toBe('index');
    expect(names(overflowRoutes)).toContain('brand-new');
  });
});
