import { getFlowSteps, stepFormPreset, type StepForm, type StepFormField } from '@hbcfield/shared/client';
import {
  formForMove, moveKind, paginateForm, workflowAsks, groupOf, SINGLE_SCREEN_FIELDS,
} from '@/features/job/step-form-logic';
import { formSheet, formSheetTarget, parseOpenSheet } from '@/features/job/job-logic';

/**
 * Step forms on the phone — which form a move asks, and how the sheet splits it.
 *
 *  - The step's OWN form wins; a legacy report step (no form, final, `report`)
 *    asks the field-service preset; an own form with no fields asks nothing.
 *  - A step with a form opens the sheet; without one the job just moves;
 *    Blocked keeps its issue sheet unless it has a form of its own.
 *  - A short form is ONE screen; a long one goes answers → photos → sign-off.
 */

const f = (id: string, type: StepFormField['type'], extra: Partial<StepFormField> = {}): StepFormField => ({
  id, type, label: id, required: false, ...(type === 'choice' ? { options: ['A', 'B'] } : {}), ...extra,
});
const form = (...fields: StepFormField[]): StepForm => ({ version: 1, fields });
const ids = (pages: StepFormField[][]) => pages.map((p) => p.map((x) => x.id));

describe('pages — one screen when it fits, answers → photos → sign-off when it does not', () => {
  it('the field-service report is the old three steps: what you did, photos, sign-off', () => {
    expect(ids(paginateForm(stepFormPreset('fieldService')))).toEqual([
      ['work_done'],
      ['photos_before', 'photos_after'],
      ['tech_signature', 'customer_name', 'customer_signature'],
    ]);
  });

  it('a choice and a note is ONE screen', () => {
    expect(ids(paginateForm(form(f('outcome', 'choice'), f('notes', 'note'))))).toEqual([['outcome', 'notes']]);
  });

  it('a sales visit and a delivery fit one screen (≤ 4 fields, one pad)', () => {
    expect(paginateForm(stepFormPreset('salesVisit'))).toHaveLength(1);
    expect(ids(paginateForm(stepFormPreset('delivery')))).toEqual([['proof_of_delivery', 'received_by', 'recipient_signature']]);
    expect(paginateForm(stepFormPreset('inspection'))).toHaveLength(1);
  });

  it('two signature pads never share a screen with the rest — even in a short form', () => {
    const short = form(f('n', 'note'), f('s1', 'signature'), f('s2', 'signature'));
    expect(short.fields.length).toBeLessThanOrEqual(SINGLE_SCREEN_FIELDS);
    expect(ids(paginateForm(short))).toEqual([['n'], ['s1', 's2']]);
  });

  it('a long form groups by kind and keeps the form\'s own order inside each page', () => {
    const long = form(f('who', 'name'), f('pics', 'photos'), f('km', 'number'), f('note', 'note'), f('ok', 'yesno'), f('on', 'date'));
    expect(ids(paginateForm(long))).toEqual([['km', 'note', 'ok', 'on'], ['pics'], ['who']]);
  });

  it('an empty group is no page, and a form of one kind is one page however long', () => {
    expect(ids(paginateForm(form(f('a', 'note'), f('b', 'note'), f('c', 'note'), f('d', 'note'), f('e', 'note'))))).toEqual([['a', 'b', 'c', 'd', 'e']]);
    expect(paginateForm(form())).toEqual([]);
  });

  it('names the groups by field type', () => {
    expect(['note', 'choice', 'number', 'yesno', 'date'].map((t) => groupOf(t as never))).toEqual(Array(5).fill('answers'));
    expect(groupOf('photos')).toBe('photos');
    expect(groupOf('signature')).toBe('signoff');
    expect(groupOf('name')).toBe('signoff');
  });
});

describe('wiring — what a move to a step opens', () => {
  const deliveries = {
    name: 'Deliveries',
    statuses: [
      { key: 'NEW', name: 'New', position: 0, transitions: ['PICKED'] },
      { key: 'PICKED', name: 'Picked up', position: 1, transitions: ['DELIVERED', 'BLOCKED'], form: null },
      { key: 'DELIVERED', name: 'Delivered', position: 2, isFinal: true, transitions: [], capabilities: [], form: { version: 3, fields: [{ id: 'pod', type: 'photos', label: 'Proof of delivery', required: true }] } },
      { key: 'BLOCKED', name: 'Couldn\'t deliver', position: 3, transitions: ['PICKED'], form: null },
    ],
  };
  const steps = getFlowSteps(deliveries as never);

  it('a step with a form opens the sheet with that form', () => {
    const r = formForMove(deliveries, steps, 'DELIVERED');
    expect(r.source).toBe('own');
    expect(r.form?.version).toBe(3);
    expect(r.form?.fields.map((x) => x.id)).toEqual(['pod']);
    expect(moveKind('DELIVERED', r)).toBe('form');
  });

  it('a step without one just moves', () => {
    const r = formForMove(deliveries, steps, 'PICKED');
    expect(r.form).toBeNull();
    expect(moveKind('PICKED', r)).toBe('direct');
  });

  it('a legacy report step asks the field-service preset through the same sheet', () => {
    const builtIn = getFlowSteps(undefined);
    const r = formForMove(null, builtIn, 'COMPLETED');
    expect(r.source).toBe('legacy');
    expect(r.form?.fields.map((x) => x.id)).toEqual(['work_done', 'photos_before', 'photos_after', 'tech_signature', 'customer_name', 'customer_signature']);
    expect(moveKind('COMPLETED', r)).toBe('form');
  });

  it('an own form with NO fields on a report step asks nothing — the organization decided', () => {
    const flow = { name: 'Field Service', statuses: [{ key: 'IN_PROGRESS', position: 0, transitions: ['COMPLETED'] }, { key: 'COMPLETED', position: 1, isFinal: true, transitions: [], form: { version: 2, fields: [] } }] };
    const r = formForMove(flow, getFlowSteps(flow as never), 'COMPLETED');
    expect(r.form).toBeNull();
    expect(moveKind('COMPLETED', r)).toBe('direct');
  });

  it('Blocked keeps its issue sheet — unless the Blocked step has a form of its own', () => {
    expect(moveKind('BLOCKED', formForMove(deliveries, steps, 'BLOCKED'))).toBe('issue');
    const withForm = { ...deliveries, statuses: deliveries.statuses.map((s) => (s.key === 'BLOCKED' ? { ...s, form: { version: 1, fields: [{ id: 'why', type: 'choice', label: 'Why', required: true, options: ['Nobody home', 'Refused'] }] } } : s)) };
    expect(moveKind('BLOCKED', formForMove(withForm, getFlowSteps(withForm as never), 'BLOCKED'))).toBe('form');
  });

  it('a job may have reports when any step of its workflow asks', () => {
    expect(workflowAsks(deliveries, steps)).toBe(true);
    expect(workflowAsks(null, getFlowSteps(undefined))).toBe(true);
    const silent = { name: 'Support', statuses: [{ key: 'OPEN', position: 0, transitions: ['CLOSED'], capabilities: [] }, { key: 'CLOSED', position: 1, isFinal: true, transitions: [], capabilities: [] }] };
    expect(workflowAsks(silent, getFlowSteps(silent as never))).toBe(false);
  });

  it('Next up hands a step with a form to the job page as `form:<STEP>` — and only a real step key', () => {
    expect(formSheet('DELIVERED')).toBe('form:DELIVERED');
    expect(parseOpenSheet('form:DELIVERED')).toBe('form:DELIVERED');
    expect(formSheetTarget(parseOpenSheet('form:DELIVERED'))).toBe('DELIVERED');
    expect(parseOpenSheet('form:../../x')).toBeNull();
    expect(parseOpenSheet('form:')).toBeNull();
    expect(formSheetTarget('finish')).toBeNull();
    // The older link still opens the form of the dock's next step.
    expect(parseOpenSheet('finish')).toBe('finish');
  });
});
