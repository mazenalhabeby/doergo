/**
 * Step forms — the pure rules in shared (`workflows/step-form`), read by the
 * builder, the phone and the server alike. Lives here because task-service's
 * jest maps `@hbcfield/shared` onto its source.
 */
import {
  STEP_FORM_LIMITS,
  STEP_FORM_PRESETS,
  STEP_FORM_PRESET_IDS,
  effectiveStepForm,
  nextStepForm,
  normalizeTemplateStatuses,
  parseStoredStepForm,
  resolveStepForm,
  stepFormCrmAnswers,
  stepFormFileIds,
  stepFormPreset,
  validateStepAnswers,
  validateStepFormDefinition,
  type StepForm,
} from '@hbcfield/shared';

const def = (fields: unknown[]) => validateStepFormDefinition({ fields });
const codes = (r: { ok: boolean; errors?: { code: string }[] }) => (r.ok ? [] : r.errors!.map((e) => e.code));

describe('validateStepFormDefinition', () => {
  it('normalises a good definition: trims, generates missing ids, required becomes a boolean', () => {
    const r = def([
      { type: 'note', label: '  What you did ', required: true },
      { id: 'c1', type: 'choice', label: 'Outcome', options: [' Won ', 'Lost', ''], crm: 'outcome' },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.form.fields[0]).toMatchObject({ type: 'note', label: 'What you did', required: true });
    expect(r.form.fields[0]!.id).toMatch(/^f_[a-z0-9]+$/);
    expect(r.form.fields[1]).toEqual({ id: 'c1', type: 'choice', label: 'Outcome', required: false, options: ['Won', 'Lost'], crm: 'outcome' });
  });

  it('accepts every one of the eight types', () => {
    const r = def([
      { id: 'a', type: 'note', label: 'a' },
      { id: 'b', type: 'choice', label: 'b', options: ['x', 'y'] },
      { id: 'c', type: 'photos', label: 'c' },
      { id: 'd', type: 'signature', label: 'd' },
      { id: 'e', type: 'name', label: 'e' },
      { id: 'f', type: 'number', label: 'f' },
      { id: 'g', type: 'yesno', label: 'g' },
      { id: 'h', type: 'date', label: 'h', crm: 'followUp' },
    ]);
    expect(r.ok).toBe(true);
  });

  it('refuses what it does not recognise instead of dropping it', () => {
    expect(codes(def([{ id: 'a', type: 'script', label: 'x' }]))).toEqual(['unknown_type']);
    expect(codes(def([{ id: 'a', type: 'note', label: 'x', formula: '1+1' }]))).toEqual(['unknown_key']);
    expect(codes(validateStepFormDefinition({ fields: [], onSubmit: 'x' }))).toEqual(['unknown_key']);
    expect(codes(validateStepFormDefinition('nope'))).toEqual(['not_object']);
  });

  it('refuses duplicate and malformed ids', () => {
    expect(codes(def([{ id: 'a', type: 'note', label: 'x' }, { id: 'a', type: 'name', label: 'y' }]))).toEqual(['duplicate_id']);
    expect(codes(def([{ id: 'a b', type: 'note', label: 'x' }]))).toEqual(['invalid_id']);
    expect(codes(def([{ id: 'x'.repeat(41), type: 'note', label: 'x' }]))).toEqual(['invalid_id']);
  });

  it('enforces the limits', () => {
    const many = Array.from({ length: STEP_FORM_LIMITS.maxFields + 1 }, (_, i) => ({ id: `f${i}`, type: 'note', label: `n${i}` }));
    expect(codes(def(many))).toEqual(['too_many_fields']);
    expect(codes(def([{ id: 'a', type: 'note', label: 'x'.repeat(81) }]))).toEqual(['label_too_long']);
    expect(codes(def([{ id: 'a', type: 'note', label: '   ' }]))).toEqual(['label_required']);
    const options = Array.from({ length: 13 }, (_, i) => `o${i}`);
    expect(codes(def([{ id: 'a', type: 'choice', label: 'x', options }]))).toEqual(['too_many_options']);
    expect(codes(def([{ id: 'a', type: 'choice', label: 'x', options: ['a', 'y'.repeat(61)] }]))).toContain('option_too_long');
  });

  it('options only on a choice, and a choice needs at least two distinct ones', () => {
    expect(codes(def([{ id: 'a', type: 'note', label: 'x', options: ['a', 'b'] }]))).toEqual(['options_not_allowed']);
    expect(codes(def([{ id: 'a', type: 'choice', label: 'x' }]))).toEqual(['options_required']);
    expect(codes(def([{ id: 'a', type: 'choice', label: 'x', options: ['only'] }]))).toEqual(['options_required']);
    expect(codes(def([{ id: 'a', type: 'choice', label: 'x', options: ['a', 'a', 'b'] }]))).toEqual(['duplicate_option']);
  });

  it('crm only on choice (outcome) and date (followUp), once each', () => {
    expect(codes(def([{ id: 'a', type: 'note', label: 'x', crm: 'outcome' }]))).toEqual(['crm_not_allowed']);
    expect(codes(def([{ id: 'a', type: 'date', label: 'x', crm: 'outcome' }]))).toEqual(['crm_not_allowed']);
    expect(codes(def([{ id: 'a', type: 'date', label: 'x', crm: 'invoice' }]))).toEqual(['crm_invalid']);
    expect(
      codes(def([{ id: 'a', type: 'date', label: 'x', crm: 'followUp' }, { id: 'b', type: 'date', label: 'y', crm: 'followUp' }])),
    ).toEqual(['crm_duplicate']);
  });

  it('ignores a client-sent version — the server decides', () => {
    const r = validateStepFormDefinition({ version: 99, fields: [] });
    expect(r).toEqual({ ok: true, form: { fields: [] } });
  });
});

describe('versioning', () => {
  const fields = [{ id: 'a', type: 'note' as const, label: 'x', required: true }];
  it('starts at 1, keeps the version on an identical save, bumps it on any change', () => {
    const v1 = nextStepForm(null, fields);
    expect(v1.version).toBe(1);
    expect(nextStepForm(v1, fields).version).toBe(1);
    expect(nextStepForm(v1, [{ ...fields[0]!, required: false }]).version).toBe(2);
    expect(nextStepForm({ version: 7, fields }, [{ ...fields[0]!, label: 'y' }]).version).toBe(8);
  });
  it('reads a stored form back, and nothing from garbage', () => {
    expect(parseStoredStepForm({ version: 3, fields })).toEqual({ version: 3, fields });
    expect(parseStoredStepForm({ version: 3, fields: [{ type: 'bogus' }] })).toBeNull();
    expect(parseStoredStepForm('x')).toBeNull();
  });
});

describe('validateStepAnswers', () => {
  const form: StepForm = {
    version: 1,
    fields: [
      { id: 'note', type: 'note', label: 'Note', required: true },
      { id: 'pick', type: 'choice', label: 'Pick', required: false, options: ['Won', 'Lost'] },
      { id: 'pics', type: 'photos', label: 'Pics', required: false },
      { id: 'sig', type: 'signature', label: 'Sig', required: false },
      { id: 'who', type: 'name', label: 'Who', required: false },
      { id: 'n', type: 'number', label: 'N', required: false },
      { id: 'ok', type: 'yesno', label: 'OK', required: true },
      { id: 'd', type: 'date', label: 'D', required: false },
    ],
  };
  const judge = (answers: unknown) => validateStepAnswers(form, answers);
  const errs = (answers: unknown) => {
    const r = judge(answers);
    return r.ok ? [] : r.errors;
  };

  it('accepts a full set of correct answers and cleans them', () => {
    const r = judge({ note: '  fixed it \u0000', pick: ' Won ', pics: ['a1', 'a2', 'a1'], sig: 's1', who: ' Ann ', n: -3.5, ok: false, d: '2026-02-28' });
    expect(r).toEqual({ ok: true, clean: { note: 'fixed it', pick: 'Won', pics: ['a1', 'a2'], sig: 's1', who: 'Ann', n: -3.5, ok: false, d: '2026-02-28' } });
  });

  it('a required field must be present and non-empty — false IS an answer', () => {
    expect(errs({ ok: true })).toEqual([{ fieldId: 'note', code: 'required' }]);
    expect(errs({ note: '   ', ok: true })).toEqual([{ fieldId: 'note', code: 'required' }]);
    expect(errs({ note: 'x' })).toEqual([{ fieldId: 'ok', code: 'required' }]);
    expect(judge({ note: 'x', ok: false }).ok).toBe(true);
    expect(errs(undefined)).toEqual([{ fieldId: 'note', code: 'required' }, { fieldId: 'ok', code: 'required' }]);
  });

  it('refuses unknown keys', () => {
    expect(errs({ note: 'x', ok: true, extra: 1 })).toEqual([{ fieldId: 'extra', code: 'unknown_field' }]);
    expect(errs(['x'])).toEqual([{ fieldId: '*', code: 'not_object' }]);
  });

  it('checks every type', () => {
    const base = { note: 'x', ok: true };
    expect(errs({ ...base, note: 5 })).toEqual([{ fieldId: 'note', code: 'wrong_type' }]);
    expect(errs({ ...base, pick: 'Maybe' })).toEqual([{ fieldId: 'pick', code: 'not_an_option' }]);
    expect(errs({ ...base, pics: 'a1' })).toEqual([{ fieldId: 'pics', code: 'wrong_type' }]);
    expect(errs({ ...base, pics: ['../etc'] })).toEqual([{ fieldId: 'pics', code: 'invalid_file' }]);
    expect(errs({ ...base, sig: ['s1'] })).toEqual([{ fieldId: 'sig', code: 'wrong_type' }]);
    expect(errs({ ...base, sig: 'data:image/png;base64,AAA' })).toEqual([{ fieldId: 'sig', code: 'invalid_file' }]);
    expect(errs({ ...base, n: '12' })).toEqual([{ fieldId: 'n', code: 'wrong_type' }]);
    expect(errs({ ...base, n: Infinity })).toEqual([{ fieldId: 'n', code: 'wrong_type' }]);
    expect(errs({ ...base, ok: 'yes' })).toEqual([{ fieldId: 'ok', code: 'wrong_type' }]);
    expect(errs({ ...base, d: '2026-02-30' })).toEqual([{ fieldId: 'd', code: 'invalid_date' }]);
    expect(errs({ ...base, d: '28.02.2026' })).toEqual([{ fieldId: 'd', code: 'invalid_date' }]);
  });

  it('enforces the limits', () => {
    const base = { note: 'x', ok: true };
    expect(errs({ ...base, note: 'x'.repeat(2001) })).toEqual([{ fieldId: 'note', code: 'too_long' }]);
    expect(judge({ ...base, note: 'x'.repeat(2000) }).ok).toBe(true);
    expect(errs({ ...base, who: 'x'.repeat(121) })).toEqual([{ fieldId: 'who', code: 'too_long' }]);
    expect(errs({ ...base, pics: Array.from({ length: 11 }, (_, i) => `p${i}`) })).toEqual([{ fieldId: 'pics', code: 'too_many' }]);
    expect(errs({ ...base, n: 1e9 + 1 })).toEqual([{ fieldId: 'n', code: 'out_of_range' }]);
    expect(judge({ ...base, n: -1e9 }).ok).toBe(true);
  });

  it('names the files and the CRM answers', () => {
    const r = judge({ note: 'x', ok: true, pics: ['a1'], sig: 's1' });
    expect(r.ok && stepFormFileIds(form, r.clean)).toEqual(['a1', 's1']);
    const sales = stepFormPreset('salesVisit');
    expect(stepFormCrmAnswers(sales, { outcome: 'Won', follow_up_on: '2026-10-01' })).toEqual({
      outcome: { label: 'Outcome', value: 'Won' },
      followUp: { label: 'Follow up on', date: '2026-10-01' },
    });
  });
});

describe('presets', () => {
  it('every preset is itself a valid definition', () => {
    for (const id of STEP_FORM_PRESET_IDS) {
      const r = validateStepFormDefinition(STEP_FORM_PRESETS[id]);
      expect(r.ok).toBe(true);
    }
    expect(STEP_FORM_PRESET_IDS).toEqual(['fieldService', 'salesVisit', 'delivery', 'inspection', 'support']);
  });

  it('fieldService is the old report: note, before, after, both signatures, customer name — all required', () => {
    const f = STEP_FORM_PRESETS.fieldService.fields;
    expect(f.map((x) => [x.id, x.type, x.required])).toEqual([
      ['work_done', 'note', true],
      ['photos_before', 'photos', true],
      ['photos_after', 'photos', true],
      ['tech_signature', 'signature', true],
      ['customer_name', 'name', true],
      ['customer_signature', 'signature', true],
    ]);
  });

  it('salesVisit ties its outcome and follow-up to the CRM', () => {
    expect(STEP_FORM_PRESETS.salesVisit.fields.map((f) => f.crm ?? null)).toEqual(['outcome', null, 'followUp']);
  });

  it('a preset copy can be edited without touching the preset', () => {
    const copy = stepFormPreset('delivery');
    copy.fields[0]!.label = 'changed';
    expect(STEP_FORM_PRESETS.delivery.fields[0]!.label).toBe('Proof of delivery');
  });
});

describe('effectiveStepForm — which form a step asks', () => {
  it("the step's own form wins", () => {
    const own = { version: 2, fields: [{ id: 'a', type: 'note', label: 'x', required: true }] };
    expect(resolveStepForm({ key: 'COMPLETED', isFinal: true, capabilities: ['report'], form: own })).toEqual({ form: own, source: 'own' });
  });

  it('an own form with no fields asks nothing — even on a legacy report step', () => {
    expect(effectiveStepForm({ key: 'COMPLETED', isFinal: true, capabilities: ['report'], form: { version: 1, fields: [] } })).toBeNull();
  });

  it('a final step with the report capability and no form asks the field-service report', () => {
    const r = resolveStepForm({ key: 'DONE', isFinal: true, capabilities: ['report', 'photos'], form: null });
    expect(r.source).toBe('legacy');
    expect(r.form).toEqual(STEP_FORM_PRESETS.fieldService);
  });

  it('reads the shipped preset when the step says nothing — a workflow-less job completing', () => {
    expect(effectiveStepForm({ key: 'COMPLETED' }, null)).toEqual(STEP_FORM_PRESETS.fieldService);
  });

  it('asks nothing of a non-final step, of a final one without report, or of own-empty capabilities', () => {
    expect(effectiveStepForm({ key: 'IN_PROGRESS', capabilities: ['timer', 'report'] })).toBeNull();
    expect(effectiveStepForm({ key: 'DELIVERED', isFinal: true, capabilities: ['photos', 'signature'] })).toBeNull();
    // A DB step always has capabilities ([] default): its own list is authoritative.
    expect(effectiveStepForm({ key: 'COMPLETED', isFinal: true, capabilities: [] })).toBeNull();
    expect(effectiveStepForm({ key: 'OUTCOME' }, 'Sales Visit')).toBeNull();
    expect(effectiveStepForm(null)).toBeNull();
  });

  it('a corrupt stored form falls back to the legacy rule', () => {
    expect(effectiveStepForm({ key: 'COMPLETED', isFinal: true, capabilities: ['report'], form: { fields: [{ type: 'x' }] } }))
      .toEqual(STEP_FORM_PRESETS.fieldService);
  });
});

describe('library templates carry a step form', () => {
  it('keeps a valid form and drops a malformed one', () => {
    const [a, b] = normalizeTemplateStatuses([
      { key: 'DONE', name: 'Done', isFinal: true, form: { fields: [{ id: 'n', type: 'note', label: 'Notes' }] } },
      { key: 'X', name: 'X', form: { fields: [{ type: 'evil' }] } },
    ]);
    expect(a!.form).toEqual({ fields: [{ id: 'n', type: 'note', label: 'Notes', required: false }] });
    expect(b!.form).toBeUndefined();
  });
});
