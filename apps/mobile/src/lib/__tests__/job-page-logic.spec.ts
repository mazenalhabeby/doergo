import { FIELD_SERVICE_FLOW, WORKFLOW_TEMPLATES, getFlowSteps } from '@hbcfield/shared/client';
import {
  canDecline, checklistMode, checklistStep, decideNext, dockMode, finishCanAdvance, finishMissing,
  formatOnJob, heldUntilDue, isClosedStatus, issueReason, mainSteps, moreOptions, needsReport,
  stepPosition, tickOptimistic, withTick, type CheckItem, type FinishDraft,
} from '../../components/job/job-logic';

/**
 * The job page's rules — `docs/design/job-flow.html`, `decision()`.
 *
 * The page draws what these return, so this is where "the bottom button is the
 * next step of the job's OWN workflow" is held.
 */

const FIELD = getFlowSteps(WORKFLOW_TEMPLATES.find((w) => w.id === 'field-service') as never);
const INSPECTION = getFlowSteps(WORKFLOW_TEMPLATES.find((w) => w.id === 'inspection') as never);

/** The mockup's second flow — nothing in it is a canonical field-service word. */
const SUPPORT = getFlowSteps({
  statuses: [
    { key: 'OPEN', name: 'Open', position: 0, transitions: ['TRIAGING', 'CANCELED'] },
    { key: 'TRIAGING', name: 'Triaging', position: 1, transitions: ['IN_PROGRESS'] },
    { key: 'IN_PROGRESS', name: 'In progress', position: 2, transitions: ['WAITING', 'BLOCKED'], capabilities: ['timer'] },
    { key: 'BLOCKED', name: 'Blocked', position: 3, transitions: ['IN_PROGRESS'] },
    { key: 'WAITING', name: 'Waiting on client', position: 4, transitions: ['RESOLVED'] },
    { key: 'RESOLVED', name: 'Resolved', position: 5, transitions: ['CLOSED'] },
    { key: 'CLOSED', name: 'Closed', position: 6, isFinal: true, transitions: [] },
    { key: 'CANCELED', name: 'Canceled', position: 7, isCanceled: true, transitions: [] },
  ],
} as never);

describe('the primary is the next step of the workflow', () => {
  it('field service: each step offers the next one, never a cancel', () => {
    expect(decideNext('ASSIGNED', FIELD).primary).toBe('ACCEPTED');
    expect(decideNext('ACCEPTED', FIELD).primary).toBe('EN_ROUTE');
    expect(decideNext('EN_ROUTE', FIELD).primary).toBe('ARRIVED');
    expect(decideNext('ARRIVED', FIELD).primary).toBe('IN_PROGRESS');
    expect(decideNext('IN_PROGRESS', FIELD).primary).toBe('COMPLETED');
  });

  it('a custom flow uses its own steps — nothing hardcoded', () => {
    expect(decideNext('OPEN', SUPPORT).primary).toBe('TRIAGING');
    expect(decideNext('IN_PROGRESS', SUPPORT)).toEqual({ primary: 'WAITING', rest: ['BLOCKED'], resume: false });
    expect(decideNext('WAITING', SUPPORT).primary).toBe('RESOLVED');
  });

  it('Blocked is never the primary when there is another way on — it goes to ⋯', () => {
    const d = decideNext('IN_PROGRESS', FIELD);
    expect(d.primary).toBe('COMPLETED');
    expect(d.rest).toEqual(['BLOCKED']);
  });

  it('a cancel state is never offered as a step', () => {
    expect(decideNext('ASSIGNED', FIELD).rest).not.toContain('CANCELED');
    expect(decideNext('OPEN', SUPPORT).rest).toEqual([]);
  });

  it('BLOCKED → back to work: the step it resumes to, flagged so the label says so', () => {
    expect(decideNext('BLOCKED', FIELD)).toEqual({ primary: 'IN_PROGRESS', rest: [], resume: true });
    expect(decideNext('BLOCKED', SUPPORT)).toMatchObject({ primary: 'IN_PROGRESS', resume: true });
    // A flow with no Blocked step of its own still resumes to the working step.
    expect(decideNext('BLOCKED', FIELD_SERVICE_FLOW)).toMatchObject({ primary: 'IN_PROGRESS', resume: true });
  });

  it('a finished or called-off job offers nothing', () => {
    expect(decideNext('COMPLETED', FIELD).primary).toBeNull();
    expect(decideNext('CANCELED', FIELD).primary).toBeNull();
    expect(decideNext('CLOSED', SUPPORT).primary).toBeNull();
  });

  it('a flow without ACCEPTED goes straight on (the bug status-action.spec pins)', () => {
    const noAccept = getFlowSteps({ statuses: [
      { key: 'ASSIGNED', name: 'Assigned', position: 0, transitions: ['EN_ROUTE'] },
      { key: 'EN_ROUTE', name: 'On the way', position: 1, transitions: ['DONE'] },
      { key: 'DONE', name: 'Done', position: 2, isFinal: true, transitions: [] },
    ] } as never);
    expect(decideNext('ASSIGNED', noAccept).primary).toBe('EN_ROUTE');
  });

  it('a step with no transitions written falls back to the next by position', () => {
    const bare = getFlowSteps({ statuses: [
      { key: 'TODO', name: 'To do', position: 0 },
      { key: 'DOING', name: 'Doing', position: 1 },
      { key: 'DONE', name: 'Done', position: 2, isFinal: true },
    ] } as never);
    expect(decideNext('TODO', bare).primary).toBe('DOING');
  });
});

describe('the step bar', () => {
  it('draws the flow without its cancel and Blocked states', () => {
    expect(mainSteps(FIELD).map((s) => s.key)).toEqual(['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED']);
  });
  it('says where the job is and what is next', () => {
    const p = stepPosition('ARRIVED', FIELD);
    expect(p.index).toBe(3);
    expect(p.total).toBe(6);
    expect(p.next?.key).toBe('IN_PROGRESS');
  });
  it('a blocked job sits on the step it stopped', () => {
    expect(stepPosition('BLOCKED', FIELD).index).toBe(4);
  });
  it('the last step has no next', () => {
    expect(stepPosition('COMPLETED', FIELD).next).toBeNull();
  });
});

describe('closing with a report', () => {
  it('field service completes through the report', () => {
    expect(needsReport('COMPLETED', FIELD, 'Field Service')).toBe(true);
  });
  it('a final step without the report capability just goes', () => {
    expect(needsReport('CLOSED', SUPPORT, 'Support')).toBe(false);
    expect(needsReport('SUBMITTED', INSPECTION, 'Inspection / Audit')).toBe(false);
  });
  it('an intermediate step never opens the report', () => {
    expect(needsReport('IN_PROGRESS', FIELD, 'Field Service')).toBe(false);
  });
  it('knows which statuses are over', () => {
    expect(isClosedStatus('COMPLETED', FIELD)).toBe(true);
    expect(isClosedStatus('CANCELED', FIELD)).toBe(true);
    expect(isClosedStatus('IN_PROGRESS', FIELD)).toBe(false);
  });
});

describe('who sees which dock', () => {
  it('the person doing the job gets the step; an overseer on somebody else\'s job gets Assign', () => {
    expect(dockMode({ closed: false, oversees: false, isMine: true })).toBe('doer');
    expect(dockMode({ closed: false, oversees: true, isMine: false })).toBe('overseer');
  });
  it('an overseer who IS the assignee does the work — "am I doing it", not "am I an admin"', () => {
    expect(dockMode({ closed: false, oversees: true, isMine: true })).toBe('doer');
  });
  it('a finished job has no buttons', () => {
    expect(dockMode({ closed: true, oversees: true, isMine: true })).toBe('closed');
  });
});

describe('decline — only where the server allows it', () => {
  it('the assignee, while the job is ASSIGNED', () => {
    expect(canDecline({ isMine: true, status: 'ASSIGNED' })).toBe(true);
  });
  it('not once it moved on (TASK_STATE_CONFLICT), not somebody else\'s (TASK_REASSIGNED)', () => {
    expect(canDecline({ isMine: true, status: 'ACCEPTED' })).toBe(false);
    expect(canDecline({ isMine: false, status: 'ASSIGNED' })).toBe(false);
  });
});

describe('⋯', () => {
  const base = { isMine: true, hasPlace: true, oversees: false, canAssign: false, canEdit: false };
  it('holds the other steps, Report an issue and Decline for the doer', () => {
    const assigned = moreOptions({ ...base, mode: 'doer', decision: decideNext('ASSIGNED', FIELD), status: 'ASSIGNED' });
    expect(assigned.map((o) => o.kind)).toEqual(['decline', 'maps']);
    const working = moreOptions({ ...base, mode: 'doer', decision: decideNext('IN_PROGRESS', FIELD), status: 'IN_PROGRESS' });
    expect(working.map((o) => o.kind)).toEqual(['issue', 'maps']);
  });
  it('an overseer gets Assign, Edit and Cancel — and no steps', () => {
    const o = moreOptions({ ...base, isMine: false, oversees: true, canAssign: true, canEdit: true, mode: 'overseer', decision: decideNext('ASSIGNED', FIELD), status: 'ASSIGNED' });
    expect(o.map((x) => x.kind)).toEqual(['maps', 'assign', 'edit', 'cancel']);
  });
  it('permissions the reader lacks are not offered', () => {
    const o = moreOptions({ ...base, isMine: false, oversees: true, mode: 'overseer', decision: decideNext('ASSIGNED', FIELD), status: 'ASSIGNED' });
    expect(o.map((x) => x.kind)).toEqual(['maps', 'cancel']);
  });
  it('no place, no maps', () => {
    expect(moreOptions({ ...base, hasPlace: false, mode: 'doer', decision: decideNext('ACCEPTED', FIELD), status: 'ACCEPTED' })).toEqual([]);
  });
});

describe('the travel step waits for the job\'s day', () => {
  const now = new Date('2026-09-27T10:00:00');
  it('holds EN_ROUTE for a job due on a later day', () => {
    expect(heldUntilDue('EN_ROUTE', '2026-09-29T09:00:00', now)).toBe(true);
    expect(heldUntilDue('EN_ROUTE', '2026-09-27T18:00:00', now)).toBe(false);
  });
  it('never holds any other step', () => {
    expect(heldUntilDue('ACCEPTED', '2026-09-29T09:00:00', now)).toBe(false);
  });
});

describe('the checklist', () => {
  const items: CheckItem[] = [
    { id: 'a', text: 'Isolate unit 3', isCompleted: false, position: 0 },
    { id: 'b', text: 'Replace valve', isCompleted: false, position: 1 },
  ];

  it('is tickable only by the doer, at a checklist step, with a signal', () => {
    expect(checklistMode({ doer: true, stepHasChecklist: true, moduleOn: true, offline: false })).toBe('tick');
    expect(checklistMode({ doer: false, stepHasChecklist: true, moduleOn: true, offline: false })).toBe('readonly');
    expect(checklistMode({ doer: true, stepHasChecklist: false, moduleOn: true, offline: false })).toBe('readonly');
    expect(checklistMode({ doer: true, stepHasChecklist: true, moduleOn: false, offline: false })).toBe('readonly');
  });

  it('is disabled — not queued — with no signal', () => {
    expect(checklistMode({ doer: true, stepHasChecklist: true, moduleOn: true, offline: true })).toBe('offline');
  });

  it('says at which step ticking opens', () => {
    expect(checklistStep(INSPECTION, 'Inspection / Audit')).toBe('IN_PROGRESS');
    expect(checklistStep(FIELD, 'Field Service')).toBeNull();
  });

  it('ticks at once, and keeps the tick when the server agrees', async () => {
    let state = items;
    const apply = (u: (x: CheckItem[]) => CheckItem[]) => { state = u(state); };
    let seenDuringSend: boolean | undefined;
    const ok = await tickOptimistic('a', true, apply, async () => { seenDuringSend = state[0]!.isCompleted; });
    expect(ok).toBe(true);
    expect(seenDuringSend).toBe(true); // optimistic: ticked before the answer
    expect(state[0]!.isCompleted).toBe(true);
  });

  it('rolls back ONLY that item when the server refuses', async () => {
    let state = items;
    const apply = (u: (x: CheckItem[]) => CheckItem[]) => { state = u(state); };
    const ok = await tickOptimistic('a', true, apply, async () => {
      // A second tick lands while the first is in flight.
      apply((x) => withTick(x, 'b', true));
      throw new Error('402');
    });
    expect(ok).toBe(false);
    expect(state.find((i) => i.id === 'a')!.isCompleted).toBe(false);
    expect(state.find((i) => i.id === 'b')!.isCompleted).toBe(true);
  });
});

describe('finish the job — three steps, the same required fields', () => {
  const empty: FinishDraft = { summary: '', details: '', customerName: '', techSigned: false, customerSigned: false };

  it('step 1 needs a summary; details are optional', () => {
    expect(finishCanAdvance(0, empty)).toBe(false);
    expect(finishCanAdvance(0, { ...empty, summary: '   ' })).toBe(false);
    expect(finishCanAdvance(0, { ...empty, summary: 'Replaced the valve' })).toBe(true);
  });

  it('step 2 — photos — never blocks', () => {
    expect(finishCanAdvance(1, empty)).toBe(true);
  });

  it('sign-off needs the customer\'s name AND both signatures', () => {
    const named = { ...empty, summary: 'x', customerName: 'Anna Müller' };
    expect(finishCanAdvance(2, named)).toBe(false);
    expect(finishCanAdvance(2, { ...named, techSigned: true })).toBe(false);
    expect(finishCanAdvance(2, { ...named, customerSigned: true })).toBe(false);
    expect(finishCanAdvance(2, { ...named, techSigned: true, customerSigned: true })).toBe(true);
    expect(finishCanAdvance(2, { ...named, customerName: ' ', techSigned: true, customerSigned: true })).toBe(false);
  });

  it('names what is missing', () => {
    expect(finishMissing(empty)).toEqual(['summary', 'techSignature', 'customerName', 'customerSignature']);
    expect(finishMissing({ ...empty, summary: 'x', techSigned: true })).toEqual(['customerName', 'customerSignature']);
  });
});

describe('small words', () => {
  it('time on the job is h:mm', () => {
    expect(formatOnJob(72 * 60)).toBe('1:12');
    expect(formatOnJob(59)).toBe('0:00');
  });
  it('an issue reason carries what, how badly and the note', () => {
    expect(issueReason(' Ceiling panel locked ', 'High', '')).toBe('Ceiling panel locked (High)');
    expect(issueReason('Locked', 'Low', 'Key at security')).toBe('Locked (Low). Key at security');
  });
});
