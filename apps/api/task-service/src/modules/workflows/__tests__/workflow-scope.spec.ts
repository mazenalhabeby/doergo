import { workflowScope, spaceMayOffer, workflowAdvice } from '@hbcfield/shared';

/**
 * How far a task type reaches.
 *
 * A local type belongs to one space. The rule matters because the failure is
 * silent: attaching someone else's local type elsewhere would hand a second
 * space edit rights over a flow the first believes is private, and the edit
 * would land on both without either being told.
 */
describe('workflowScope', () => {
  it('reads the scope off the row, not off who is asking', () => {
    expect(workflowScope({ ownerSpaceId: null })).toBe('organization');
    expect(workflowScope({ ownerSpaceId: undefined })).toBe('organization');
    expect(workflowScope({})).toBe('organization');
    expect(workflowScope({ ownerSpaceId: 'sp-1' })).toBe('space');
  });

  it('treats an empty string as no owner rather than an owner named ""', () => {
    expect(workflowScope({ ownerSpaceId: '' })).toBe('organization');
  });
});

describe('spaceMayOffer', () => {
  it('lets any space offer an organization-wide type', () => {
    expect(spaceMayOffer({ ownerSpaceId: null }, 'sp-1')).toBe(true);
    expect(spaceMayOffer({ ownerSpaceId: null }, 'sp-2')).toBe(true);
  });

  it('lets a space offer its own local type', () => {
    expect(spaceMayOffer({ ownerSpaceId: 'sp-1' }, 'sp-1')).toBe(true);
  });

  it('refuses another space local type — this is the whole point of local', () => {
    expect(spaceMayOffer({ ownerSpaceId: 'sp-1' }, 'sp-2')).toBe(false);
  });

  it('refuses when there is no workflow at all rather than defaulting to yes', () => {
    expect(spaceMayOffer(null, 'sp-1')).toBe(false);
    expect(spaceMayOffer(undefined, 'sp-1')).toBe(false);
  });
});

/**
 * Advice, not errors.
 *
 * `validateWorkflow` refuses flows that TRAP work. These describe flows that
 * merely work badly, so nothing here blocks anything — a two-step flow is a
 * legitimate choice, and a builder that argues with every decision stops being
 * read. They exist so a first-time author is told what practised flows have.
 */
describe('workflowAdvice', () => {
  const solid = [
    { key: 'NEW', name: 'New', position: 0, transitions: ['DOING'], capabilities: [] },
    { key: 'DOING', name: 'Doing', position: 1, transitions: ['BLOCKED', 'DONE'], capabilities: ['timer'] },
    { key: 'BLOCKED', name: 'Blocked', position: 2, transitions: ['DOING'], capabilities: [] },
    { key: 'DONE', name: 'Done', position: 3, isFinal: true, transitions: [], capabilities: ['report'] },
    { key: 'CANCELED', name: 'Canceled', position: 4, isCanceled: true, transitions: [], capabilities: [] },
  ];

  it('says nothing about a flow that is already well built', () => {
    expect(workflowAdvice(solid)).toEqual([]);
  });

  it('says nothing at all about an empty flow — that is validation is job, not advice', () => {
    expect(workflowAdvice([])).toEqual([]);
    expect(workflowAdvice(null)).toEqual([]);
  });

  it('notices there is no way to call a job off', () => {
    const noCancel = solid.filter((s) => !s.isCanceled);
    expect(workflowAdvice(noCancel).map((a) => a.code)).toContain('no_cancel_path');
  });

  it('notices a flow that only ever moves forward', () => {
    const oneWay = [
      { key: 'A', name: 'A', position: 0, transitions: ['B'], capabilities: ['timer'] },
      { key: 'B', name: 'B', position: 1, transitions: ['C'], capabilities: [] },
      { key: 'C', name: 'C', position: 2, transitions: ['D'], capabilities: [] },
      { key: 'D', name: 'D', position: 3, isFinal: true, transitions: [], capabilities: [] },
      { key: 'X', name: 'X', position: 4, isCanceled: true, transitions: [], capabilities: [] },
    ];
    expect(workflowAdvice(oneWay).map((a) => a.code)).toContain('no_exception_path');
  });

  it('does not nag a short flow about exception paths', () => {
    // Two working steps is a to-do list. A blocked state would be ceremony.
    const short = [
      { key: 'TODO', name: 'To do', position: 0, transitions: ['DONE'], capabilities: ['checklist'] },
      { key: 'DONE', name: 'Done', position: 1, isFinal: true, transitions: [], capabilities: [] },
      { key: 'X', name: 'Canceled', position: 2, isCanceled: true, transitions: [], capabilities: [] },
    ];
    expect(short.length).toBeGreaterThan(0);
    expect(workflowAdvice(short).map((a) => a.code)).not.toContain('no_exception_path');
  });

  it('notices a flow nobody could work through', () => {
    const long = Array.from({ length: 15 }, (_, i) => ({
      key: `S${i}`, name: `S${i}`, position: i,
      transitions: i < 14 ? [`S${i + 1}`] : [], isFinal: i === 14, capabilities: ['timer'],
    }));
    expect(workflowAdvice(long).map((a) => a.code)).toContain('too_many_steps');
  });

  it('notices work asked for at a step where the work is already over', () => {
    const late = [
      { key: 'A', name: 'A', position: 0, transitions: ['DONE'], capabilities: ['timer'] },
      { key: 'DONE', name: 'Done', position: 1, isFinal: true, transitions: [], capabilities: ['gps'] },
      { key: 'X', name: 'Canceled', position: 2, isCanceled: true, transitions: [], capabilities: [] },
    ];
    const codes = workflowAdvice(late).map((a) => a.code);
    expect(codes).toContain('capability_on_final');
  });

  it('accepts sign-off and the report on a finished step — that IS completing the work', () => {
    const signOff = [
      { key: 'A', name: 'A', position: 0, transitions: ['DONE'], capabilities: ['timer'] },
      { key: 'DONE', name: 'Done', position: 1, isFinal: true, transitions: [], capabilities: ['report', 'signature', 'photos'] },
      { key: 'X', name: 'Canceled', position: 2, isCanceled: true, transitions: [], capabilities: [] },
    ];
    expect(workflowAdvice(signOff).map((a) => a.code)).not.toContain('capability_on_final');
  });

  it('notices a flow where nothing is ever asked of anyone', () => {
    const inert = [
      { key: 'A', name: 'A', position: 0, transitions: ['DONE'], capabilities: [] },
      { key: 'DONE', name: 'Done', position: 1, isFinal: true, transitions: [], capabilities: [] },
      { key: 'X', name: 'Canceled', position: 2, isCanceled: true, transitions: [], capabilities: [] },
    ];
    expect(workflowAdvice(inert).map((a) => a.code)).toContain('no_capabilities');
  });

  it('never blocks: every message is advice, and a sound flow can carry several', () => {
    const codes = workflowAdvice([{ key: 'ONLY', name: 'Only', position: 0, isFinal: true, transitions: [], capabilities: [] }]);
    expect(codes.map((a) => a.code)).toEqual(expect.arrayContaining(['single_step', 'no_cancel_path', 'no_capabilities']));
    expect(codes.every((a) => typeof a.message === 'string' && a.message.length > 0)).toBe(true);
  });
});
