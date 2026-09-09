import { getStatusAction } from '../../components/task-detail/task-detail-helpers';

/**
 * The forward step comes from the WORKFLOW, never from a hardcoded chain.
 *
 * The bug this pins, reported from a real task: pressing "Accept Job" returned
 *
 *   400 — Invalid status transition from ASSIGNED to ACCEPTED. Allowed: EN_ROUTE
 *
 * ACCEPTED is a step in the CANONICAL flow. A space's own workflow need not have
 * it — "Field Service" runs NEW → ASSIGNED → EN_ROUTE → ARRIVED → WORKING → DONE
 * and contains no ACCEPTED at all. The screen hardcoded ACCEPTED for any ASSIGNED
 * task, so the button was unusable on every workflow that skips acceptance, and
 * the server rejected each press.
 */

const flow = (...keys: string[]) =>
  keys.map((key, i) => ({
    key,
    label: key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, ' '),
    position: i,
    isFinal: key === 'DONE',
    isCanceled: false,
    transitions: keys[i + 1] ? [keys[i + 1]!] : [],
    capabilities: [],
  })) as never;

const FIELD_SERVICE = flow('NEW', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'WORKING', 'DONE');
const CANONICAL = flow('NEW', 'ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED');

describe('the next step follows the flow the task is actually on', () => {
  it('goes ASSIGNED → EN_ROUTE on a flow with no acceptance step', () => {
    expect(getStatusAction('ASSIGNED', FIELD_SERVICE)?.nextStatus).toBe('EN_ROUTE');
  });

  it('goes ASSIGNED → ACCEPTED where the flow does have one', () => {
    expect(getStatusAction('ASSIGNED', CANONICAL)?.nextStatus).toBe('ACCEPTED');
  });

  it('follows a flow whose steps are nothing like the canonical ones', () => {
    const logistics = flow('BOOKED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED');
    expect(getStatusAction('PICKED_UP', logistics)?.nextStatus).toBe('IN_TRANSIT');
  });

  it('offers nothing at the end of the flow', () => {
    expect(getStatusAction('DONE', FIELD_SERVICE)).toBeNull();
  });
});

/*
  BUILTIN_ACTIONS is keyed by the CURRENT status, so the friendly wording was
  borrowed whether or not it described where the button actually goes: ASSIGNED
  read "Accept Job" on Field Service while moving to En Route. A label naming
  the wrong destination is worse than a plain one, because only one of them can
  be checked against what happens.
*/
describe('the label names the step it really takes', () => {
  it('uses the friendly wording when it fits', () => {
    expect(getStatusAction('ASSIGNED', CANONICAL)?.label).toBe('Accept Job');
  });

  it('does not say "Accept" when accepting is not what happens', () => {
    const action = getStatusAction('ASSIGNED', FIELD_SERVICE)!;
    expect(action.label).not.toMatch(/accept/i);
    expect(action.label).toContain('En route');
  });

  it('describes a custom step by its own name', () => {
    const logistics = flow('BOOKED', 'PICKED_UP', 'IN_TRANSIT');
    expect(getStatusAction('BOOKED', logistics)?.label).toContain('Picked up');
  });
});
