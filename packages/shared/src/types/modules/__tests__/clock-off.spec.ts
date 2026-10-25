import { hasAccessModule } from '../profile';

/** An administrator off the clock (clock review A7): no clock, everything else as before. */
describe('hasAccessModule — clockOff', () => {
  const admin = { role: 'ADMIN', enabledModules: null };

  it('an admin holds the clock by default', () => {
    expect(hasAccessModule(admin, 'clock')).toBe(true);
  });

  it('an admin off the clock loses the clock only', () => {
    const off = { ...admin, clockOff: true };
    expect(hasAccessModule(off, 'clock')).toBe(false);
    expect(hasAccessModule(off, 'tasks')).toBe(true);
    expect(hasAccessModule(off, 'time_off')).toBe(true);
  });

  it('clockOff false or missing changes nothing for a member', () => {
    expect(hasAccessModule({ role: 'EMPLOYEE', enabledModules: null, clockOff: false }, 'clock')).toBe(true);
  });
});
