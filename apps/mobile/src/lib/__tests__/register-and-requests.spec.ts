/**
 * Equipment and client requests on the phone (Manage): who is offered the
 * rows, how a request's stage is read, and who "has it" says.
 */
import { manageRowsFor } from '../manage-rows';
import { stageOf } from '@/features/client-requests/request-stage';
import { holderName } from '@/features/register/register-words';

const labels = (u: unknown) => manageRowsFor(u as never).map((r) => r.labelKey);

const external = (perms: Record<string, boolean>, modules: string[]) => ({
  role: 'EMPLOYEE',
  isExternal: true,
  access: { org: {}, perSpace: { s1: perms } },
  spaceModules: modules,
});

describe('Manage rows', () => {
  it('an external member given View in a workspace that runs the module is offered the row', () => {
    const l = labels(external({ canViewAssets: true, canViewPortal: true }, ['assets', 'b2c_portal']));
    expect(l).toContain('manage.equipment.label');
    expect(l).toContain('manage.clientRequests.label');
  });

  it('no permission, no row — whatever the workspace runs', () => {
    const l = labels(external({ canViewAllTasks: true }, ['assets', 'b2c_portal']));
    expect(l).not.toContain('manage.equipment.label');
    expect(l).not.toContain('manage.clientRequests.label');
  });

  it('the permission without the module is a screen that could only be empty — no row', () => {
    const l = labels(external({ canViewAssets: true, canViewPortal: true }, ['crm']));
    expect(l).not.toContain('manage.equipment.label');
    expect(l).not.toContain('manage.clientRequests.label');
  });

  it('staff with the permission get the same rows (not externals only)', () => {
    const l = labels({ role: 'EMPLOYEE', access: { org: { canViewAssets: true }, perSpace: {} }, spaceModules: ['assets'] });
    expect(l).toContain('manage.equipment.label');
  });
});

describe('a request’s stage', () => {
  const req = (triaged: boolean, states: Array<'done' | 'active' | 'pending'>) =>
    ({ triaged, timeline: states.map((state, i) => ({ label: String(i), state })) }) as never;

  it('not turned into a job yet is waiting', () => expect(stageOf(req(false, []))).toBe('waiting'));
  it('a job under way', () => expect(stageOf(req(true, ['done', 'active', 'pending']))).toBe('job'));
  it('a job at its last step is done', () => expect(stageOf(req(true, ['done', 'done', 'active']))).toBe('done'));
  it('a job with no flow steps reads as under way, never done', () => expect(stageOf(req(true, []))).toBe('job'));
});

describe('who has it', () => {
  it('nobody', () => expect(holderName([])).toBeNull());
  it('a member by name', () => expect(holderName([{ id: 'h', userId: 'u', customerId: null, user: { id: 'u', firstName: 'Hassan', lastName: 'Berger' } }])).toBe('Hassan Berger'));
  it('a client', () => expect(holderName([{ id: 'h', userId: null, customerId: 'c', customer: { id: 'c', name: 'BILLA AG' } }])).toBe('BILLA AG'));
  it('several: the first and how many more', () => expect(holderName([
    { id: 'a', userId: 'u', customerId: null, user: { id: 'u', firstName: 'Lisa', lastName: 'Adler' } },
    { id: 'b', userId: 'v', customerId: null, user: { id: 'v', firstName: 'Noor', lastName: 'Shah' } },
  ])).toBe('Lisa Adler +1'));
});
