/**
 * Who sees Today's route (`drivesRoutes`). A gate on a way in — the server
 * refuses on its own (route-widget-endpoint.spec.ts in the gateway) — but the
 * card and the Plan route tile must answer the same member the same way, and
 * the same way the server does about `tracking`.
 */
import { drivesRoutes } from '../member-reach';

const withTasks = { modules: ['tasks'] };
const clockOnly = { modules: ['attendance'] };

describe('Today\'s route — who gets it', () => {
  it('a driver: tasks in the profile, tracking in an assigned workspace', () => {
    expect(drivesRoutes({ role: 'EMPLOYEE', enabledModules: withTasks, spaceModules: ['tracking'] } as never)).toBe(true);
  });

  it('a driver whose profile names nothing (no profile stored): the tasks check passes', () => {
    expect(drivesRoutes({ role: 'EMPLOYEE', spaceModules: ['tracking'] } as never)).toBe(true);
  });

  it('no tracking in any of their workspaces — even if the org runs it somewhere else', () => {
    expect(drivesRoutes({ role: 'EMPLOYEE', enabledModules: withTasks, spaceModules: ['crm'], orgModules: ['tracking'] } as never)).toBe(false);
  });

  it('clock only (no tasks module): no stops to drive', () => {
    expect(drivesRoutes({ role: 'EMPLOYEE', enabledModules: clockOnly, spaceModules: ['tracking'] } as never)).toBe(false);
  });

  it('external: never, whatever runs where', () => {
    expect(drivesRoutes({ role: 'EMPLOYEE', isExternal: true, enabledModules: withTasks, spaceModules: ['tracking'] } as never)).toBe(false);
    expect(drivesRoutes({ role: 'ADMIN', isExternal: true, spaceModules: ['tracking'] } as never)).toBe(false);
  });

  it('an admin with tracking somewhere: yes (every module), with none: no', () => {
    expect(drivesRoutes({ role: 'ADMIN', enabledModules: clockOnly, spaceModules: ['tracking'] } as never)).toBe(true);
    expect(drivesRoutes({ role: 'ADMIN', spaceModules: [] } as never)).toBe(false);
  });

  it('an older session: no isExternal is NOT external; no spaceModules falls back to the org list', () => {
    expect(drivesRoutes({ role: 'EMPLOYEE', enabledModules: withTasks, orgModules: ['tracking'] } as never)).toBe(true);
    expect(drivesRoutes({ role: 'EMPLOYEE', enabledModules: withTasks, spaceModules: null, orgModules: ['tracking'] } as never)).toBe(true);
    expect(drivesRoutes({ role: 'EMPLOYEE', enabledModules: withTasks, isExternal: null, spaceModules: ['tracking'] } as never)).toBe(true);
  });

  it('only a literal true is external (a string is not a boolean)', () => {
    expect(drivesRoutes({ role: 'EMPLOYEE', enabledModules: withTasks, isExternal: 'false', spaceModules: ['tracking'] } as never)).toBe(true);
  });

  it('no session: no', () => {
    expect(drivesRoutes(null)).toBe(false);
    expect(drivesRoutes(undefined)).toBe(false);
  });
});
