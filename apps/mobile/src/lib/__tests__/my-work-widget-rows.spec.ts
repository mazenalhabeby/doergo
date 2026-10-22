import {
  shapeFor, faceFor, viewAllSpaceIds, isMine, isCanceled, withoutCanceled, stepLabelFor, stepsFor, isClosed, tasksOn, figuresFor,
} from '../../features/home/my-work';
import type { Task } from '../api/types';

const task = (over: Record<string, unknown>): Task => ({
  id: 't', title: 'Job', status: 'ASSIGNED', priority: 'MEDIUM', organizationId: 'o', createdById: 'x',
  createdAt: '', updatedAt: '', assignedToId: 'me', assignees: [], ...over,
} as unknown as Task);

/* A translator that knows the canonical status words and nothing else, like the mobile bundle today. */
const DE: Record<string, string> = { 'status.EN_ROUTE': 'Unterwegs', 'status.CANCELED': 'Abgebrochen', 'status.ASSIGNED': 'Zugewiesen' };
const t = (k: string, o: { defaultValue: string }) => DE[k] ?? o.defaultValue;

const shipped = {
  id: 'wf', statuses: [
    { key: 'ASSIGNED', name: 'Assigned', nameKey: 'workflowStatus.assigned', position: 0, isFinal: false, isCanceled: false, transitions: ['EN_ROUTE'] },
    { key: 'EN_ROUTE', name: 'En Route', nameKey: 'workflowStatus.en_route', position: 1, isFinal: false, isCanceled: false, transitions: ['DONE'] },
    { key: 'DONE', name: 'Done', nameKey: 'workflowStatus.done', position: 2, isFinal: true, isCanceled: false, transitions: [] },
    { key: 'CALLED_OFF', name: 'Abgesagt vom Kunden', position: 3, isFinal: true, isCanceled: true, transitions: [] },
  ],
};
const flows = new Map<string, unknown>([['wf', shipped]]);

describe('my-work widget — who sees the card, and as what', () => {
  it('the three live personas resolve to the shape and face the server grants them', () => {
    // karim — tasks only, no view-all anywhere
    expect(shapeFor({ tasks: true, clock: false })).toBe('tasks');
    expect(faceFor({ role: 'EMPLOYEE', canViewAllTasks: false, viewAllSpaceIds: viewAllSpaceIds({ 'space-service': {} }) })).toBe('executor');
    // noor — clock only: the list is shifts and no task is ever read
    expect(shapeFor({ tasks: false, clock: true })).toBe('shifts');
    // a.test — EXTERNAL, view-all held in ONE space: a supervisor of that space, never org-wide
    expect(faceFor({ role: 'EMPLOYEE', canViewAllTasks: false, viewAllSpaceIds: viewAllSpaceIds({ s1: { canViewAllTasks: true, canCreateTasks: true } }) })).toBe('spaceSupervisor');
    // neither module: no card
    expect(shapeFor({ tasks: false, clock: false })).toBe('none');
  });

  it('an empty grant object or a false flag is not "view all"', () => {
    expect(viewAllSpaceIds({ a: {}, b: { canViewAllTasks: false }, c: null as never })).toEqual([]);
    expect(viewAllSpaceIds(undefined)).toEqual([]);
  });

  it('"mine" is lead OR co-assignee — never the creator, never a guess', () => {
    expect(isMine(task({ assignedToId: 'me' }), 'me')).toBe(true);
    expect(isMine(task({ assignedToId: 'other', assignees: [{ userId: 'me' }] }), 'me')).toBe(true);
    expect(isMine(task({ assignedToId: 'other', createdById: 'me', assignees: [] }), 'me')).toBe(false);
    expect(isMine(task({ assignedToId: null, assignees: undefined }), 'me')).toBe(false);
    expect(isMine(task({ assignedToId: 'me' }), undefined)).toBe(false);
  });
});

describe('my-work widget — canceled work is not done work', () => {
  it('a canonical CANCELED job is dropped; COMPLETED stays (struck through)', () => {
    const rows = [task({ id: 'c', status: 'CANCELED' }), task({ id: 'd', status: 'COMPLETED' }), task({ id: 'o', status: 'ASSIGNED' })];
    expect(withoutCanceled(rows, new Map()).map((x) => x.id)).toEqual(['d', 'o']);
  });

  it("a workflow's own cancel step (any key) is dropped; its final step is not", () => {
    const rows = [
      task({ id: 'off', status: 'CALLED_OFF', workflowId: 'wf' }),
      task({ id: 'done', status: 'DONE', workflowId: 'wf' }),
    ];
    expect(withoutCanceled(rows, flows).map((x) => x.id)).toEqual(['done']);
    expect(isCanceled(rows[1]!, stepsFor(rows[1]!, flows))).toBe(false);
    expect(isClosed(rows[1]!, stepsFor(rows[1]!, flows))).toBe(true);
  });

  it('dots and the day list come from the same filtered rows', () => {
    const day = new Date(2026, 8, 26);
    const rows = [
      task({ id: 'a', status: 'CANCELED', dueDate: new Date(2026, 8, 26, 9).toISOString() }),
      task({ id: 'b', status: 'ASSIGNED', dueDate: new Date(2026, 8, 26, 10).toISOString() }),
    ];
    expect(tasksOn(withoutCanceled(rows, new Map()), day).map((x) => x.id)).toEqual(['b']);
  });

  it('org-wide figures never count a closed job as open or unassigned', () => {
    const isOpen = (x: Task) => !isClosed(x, stepsFor(x, new Map()));
    const f = figuresFor([
      task({ status: 'COMPLETED', assignedToId: null, priority: 'URGENT' }),
      task({ status: 'ASSIGNED', assignedToId: null, priority: 'URGENT', spaceId: 's1' }),
    ], isOpen);
    expect(f).toEqual({ open: 1, urgent: 1, unassigned: 1, sites: 1 });
  });
});

describe('my-work widget — the step, in the reader\'s language', () => {
  it('a shipped step reads in the app language (the emulator showed "EN ROUTE")', () => {
    expect(stepLabelFor(task({ status: 'EN_ROUTE', workflowId: 'wf' }), flows, t)).toBe('Unterwegs');
  });

  it('a shipped step with no canonical word keeps its shipped name', () => {
    expect(stepLabelFor(task({ status: 'DONE', workflowId: 'wf' }), flows, t)).toBe('Done');
  });

  it('a person-written step is shown exactly as written, never "translated"', () => {
    expect(stepLabelFor(task({ status: 'CALLED_OFF', workflowId: 'wf' }), flows, t)).toBe('Abgesagt vom Kunden');
  });

  it('a job on the built-in flow (no workflow) reads in the app language', () => {
    expect(stepLabelFor(task({ status: 'EN_ROUTE' }), new Map(), t)).toBe('Unterwegs');
  });

  it('a workflow not on this phone still gives a readable, never blank label', () => {
    expect(stepLabelFor(task({ status: 'EN_ROUTE', workflowId: 'missing' }), new Map(), t)).toBe('Unterwegs');
    expect(stepLabelFor(task({ status: 'PICKED_UP', workflowId: 'missing' }), new Map(), t)).toBe('PICKED UP');
  });

  it('the space\'s workflow counts when the task names none', () => {
    expect(stepLabelFor(task({ status: 'EN_ROUTE', space: { workflowId: 'wf' } }), flows, t)).toBe('Unterwegs');
  });
});
