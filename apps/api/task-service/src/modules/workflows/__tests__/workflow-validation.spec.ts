import { validateWorkflow, isWorkflowUsable, entryStatusKey } from '@hbcfield/shared';

/**
 * The ways a workflow can be wrong are all quiet ones.
 *
 * A status nothing transitions to is a column no work can reach. A status with
 * no way out is a task stuck forever. A transition naming a key that does not
 * exist reads as a route and is not one. None of these fail loudly — they fail
 * months later, on one task, in one space, and look like a bug in the app.
 */
describe('validateWorkflow', () => {
  const sound = [
    { key: 'NEW', name: 'New', position: 0, transitions: ['DOING'] },
    { key: 'DOING', name: 'Working', position: 1, transitions: ['DONE'] },
    { key: 'DONE', name: 'Done', position: 2, isFinal: true, transitions: [] },
  ];

  it('passes a workflow that works', () => {
    expect(validateWorkflow(sound)).toEqual([]);
    expect(isWorkflowUsable(sound)).toBe(true);
  });

  it('reports a workflow with no steps at all', () => {
    expect(validateWorkflow([]).map((p) => p.code)).toEqual(['empty']);
    expect(validateWorkflow(null).map((p) => p.code)).toEqual(['empty']);
  });

  it('refuses a flow nothing can complete', () => {
    const endless = [
      { key: 'NEW', position: 0, transitions: ['DOING'] },
      { key: 'DOING', position: 1, transitions: ['NEW'] },
    ];
    expect(validateWorkflow(endless).map((p) => p.code)).toContain('no_final');
  });

  it('catches a transition to a step that does not exist', () => {
    const typo = [
      { key: 'NEW', name: 'New', position: 0, transitions: ['DONE_TYPO'] },
      { key: 'DONE', position: 1, isFinal: true, transitions: [] },
    ];
    const found = validateWorkflow(typo).find((p) => p.code === 'unknown_transition');
    expect(found?.statusKey).toBe('NEW');
    expect(found?.message).toContain('DONE_TYPO');
  });

  it('catches a step with no way out that is not marked finished', () => {
    const stuck = [
      { key: 'NEW', position: 0, transitions: ['LIMBO'] },
      { key: 'LIMBO', name: 'Limbo', position: 1, transitions: [] },
      { key: 'DONE', position: 2, isFinal: true, transitions: [] },
    ];
    const found = validateWorkflow(stuck).find((p) => p.code === 'dead_end');
    expect(found?.statusKey).toBe('LIMBO');
  });

  it('accepts a step with no way out WHEN it says it is the end', () => {
    expect(validateWorkflow(sound).some((p) => p.code === 'dead_end')).toBe(false);
  });

  it('catches a step nothing leads to', () => {
    const orphan = [
      { key: 'NEW', position: 0, transitions: ['DONE'] },
      { key: 'DONE', position: 1, isFinal: true, transitions: [] },
      { key: 'GHOST', name: 'Ghost', position: 2, isFinal: true, transitions: [] },
    ];
    const found = validateWorkflow(orphan).find((p) => p.code === 'unreachable');
    expect(found?.statusKey).toBe('GHOST');
  });

  it('does not call a cancellation step unreachable', () => {
    // Cancelling is not walking the flow, so nothing needs to point at it.
    const withCancel = [
      ...sound,
      { key: 'CANCELED', name: 'Canceled', position: 3, isCanceled: true, transitions: [] },
    ];
    expect(validateWorkflow(withCancel)).toEqual([]);
  });

  it('catches two steps sharing a key', () => {
    const dupe = [
      { key: 'NEW', position: 0, transitions: ['DONE'] },
      { key: 'NEW', position: 1, transitions: ['DONE'] },
      { key: 'DONE', position: 2, isFinal: true, transitions: [] },
    ];
    expect(validateWorkflow(dupe).map((p) => p.code)).toContain('duplicate_key');
  });

  it('follows transitions through the whole graph, not one hop', () => {
    const long = [
      { key: 'A', position: 0, transitions: ['B'] },
      { key: 'B', position: 1, transitions: ['C'] },
      { key: 'C', position: 2, transitions: ['D'] },
      { key: 'D', position: 3, isFinal: true, transitions: [] },
    ];
    expect(validateWorkflow(long)).toEqual([]);
  });

  it('terminates on a cycle rather than walking it forever', () => {
    const loop = [
      { key: 'A', position: 0, transitions: ['B'] },
      { key: 'B', position: 1, transitions: ['A', 'DONE'] },
      { key: 'DONE', position: 2, isFinal: true, transitions: [] },
    ];
    expect(validateWorkflow(loop)).toEqual([]);
  });

  it('reports every problem at once, not the first one', () => {
    // Someone fixing a workflow should see the whole list, not discover the
    // next fault after each save.
    const messy = [
      { key: 'A', name: 'A', position: 0, transitions: ['NOWHERE'] },
      { key: 'ORPHAN', name: 'Orphan', position: 1, transitions: [] },
    ];
    const codes = validateWorkflow(messy).map((p) => p.code);
    expect(codes).toContain('no_final');
    expect(codes).toContain('unknown_transition');
    expect(codes).toContain('dead_end');
    expect(codes).toContain('unreachable');
  });

  describe('entryStatusKey', () => {
    it('is the lowest position, matching where a new task starts', () => {
      expect(entryStatusKey(sound)).toBe('NEW');
    });

    it('skips a cancellation step even if it sorts first', () => {
      const cancelFirst = [
        { key: 'CANCELED', position: 0, isCanceled: true, transitions: [] },
        { key: 'NEW', position: 1, transitions: ['DONE'] },
        { key: 'DONE', position: 2, isFinal: true, transitions: [] },
      ];
      expect(entryStatusKey(cancelFirst)).toBe('NEW');
    });

    it('is null for a workflow with no steps', () => {
      expect(entryStatusKey([])).toBeNull();
    });
  });
});

/**
 * The refusal a person actually reads.
 *
 * `validateWorkflow` returns one entry per fault, which is right for an editor
 * that marks each step and wrong for a toast. A six-step flow with no
 * transitions produced TEN near-identical sentences on one line — the thing a
 * user reported as unreadable, and they were right: the repetition hides the
 * one fact that matters.
 */
describe('summarizeWorkflowProblems', () => {
  const { summarizeWorkflowProblems, validateWorkflow: v } = require('@hbcfield/shared');

  const noTransitions = [
    { key: 'NEW', name: 'New', position: 0, transitions: [] },
    { key: 'ASSIGNED', name: 'Assigned', position: 1, transitions: [] },
    { key: 'EN_ROUTE', name: 'En Route', position: 2, transitions: [] },
    { key: 'ARRIVED', name: 'Arrived', position: 3, transitions: [] },
    { key: 'WORKING', name: 'Working', position: 4, transitions: [] },
    { key: 'DONE', name: 'Done', position: 5, isFinal: true, transitions: [] },
  ];

  it('says nothing when there is nothing wrong', () => {
    expect(summarizeWorkflowProblems([])).toBe('');
  });

  it('collapses ten sentences into one short statement', () => {
    const problems = v(noTransitions);
    expect(problems.length).toBeGreaterThanOrEqual(10);
    const summary = summarizeWorkflowProblems(problems);
    expect(summary.length).toBeLessThan(200);
    expect(summary).toContain('5 steps have no next step');
    expect(summary).toContain('cannot be reached');
  });

  it('uses the step NAME, not its key — the key reads like a fault itself', () => {
    const summary = summarizeWorkflowProblems(v(noTransitions));
    expect(summary).toContain('En Route');
    expect(summary).not.toContain('EN_ROUTE');
  });

  it('trims a long list rather than naming thirty steps', () => {
    const summary = summarizeWorkflowProblems(v(noTransitions));
    expect(summary).toMatch(/and \d+ more/);
  });

  it('reads naturally when only one step is at fault', () => {
    const one = [
      { key: 'A', name: 'Open', position: 0, transitions: ['B'] },
      { key: 'B', name: 'Doing', position: 1, transitions: [] },
      { key: 'C', name: 'Done', position: 2, isFinal: true, transitions: [] },
    ];
    // Singular, not "1 steps have no next step".
    expect(summarizeWorkflowProblems(v(one))).toBe('Doing has no next step; nothing leads to Done');
  });

  it('leads with the fault that has no step to blame', () => {
    const endless = [
      { key: 'A', name: 'Open', position: 0, transitions: ['B'] },
      { key: 'B', name: 'Doing', position: 1, transitions: ['A'] },
    ];
    expect(summarizeWorkflowProblems(v(endless))).toBe(
      'no step is marked as finished, so nothing can be completed',
    );
  });
});
