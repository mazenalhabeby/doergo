/**
 * Step forms on the web — the builder's payloads, who owes answers when a job
 * moves, how answers are built from what was uploaded, and how a refusal finds
 * its field. The rules themselves are shared (and tested there); this pins the
 * web's use of them.
 */
import { STEP_FORM_PRESETS, STEP_FORM_REFUSAL, validateStepFormDefinition, type StepFormField } from '@hbcfield/shared/client'
import {
  answerRefusal,
  askNothingDraft,
  builderStepMode,
  buildAnswers,
  checkAnswers,
  definitionErrors,
  definitionRefusal,
  draftChanged,
  draftFromStored,
  draftToPayload,
  isStepFormRefusal,
  moveField,
  newField,
  presetDraft,
  stepFieldLabel,
  stepFormForMove,
  PENDING_FILE_PREFIX,
} from '../step-forms'

const en = (_key: string, fallback: string) => fallback
const de = (key: string, fallback: string) => (key.startsWith('stepForm.') ? `DE:${fallback}` : fallback)

const coded = (code: string, params: Record<string, unknown>) => Object.assign(new Error('refused'), { code, params })

describe('builder', () => {
  it('a preset is copied in the builder language, with the preset ids, as a fresh copy', () => {
    const a = presetDraft('salesVisit', de)
    expect(a.fields.map((f) => f.id)).toEqual(['outcome', 'notes', 'follow_up_on'])
    expect(a.fields[0]!.label).toBe('DE:Outcome')
    expect(a.fields[0]!.options).toEqual(['DE:Won', 'DE:Follow-up', 'DE:No interest', 'DE:Not reached'])
    expect(a.fields[0]!.crm).toBe('outcome')
    a.fields[0]!.label = 'changed'
    expect(STEP_FORM_PRESETS.salesVisit.fields[0]!.label).toBe('Outcome')
    expect(presetDraft('salesVisit', de).fields[0]!.label).toBe('DE:Outcome')
    // and it is a definition the server accepts
    expect(validateStepFormDefinition(draftToPayload(a)).ok).toBe(true)
  })

  it('reorders by moving one field, and ignores out-of-range moves', () => {
    expect(moveField(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveField(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(moveField(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
  })

  it('a new field has a fresh id, a label in the builder language, and a choice two options', () => {
    const existing: StepFormField[] = [{ id: 'x', type: 'note', label: 'N', required: false }]
    const f = newField('choice', existing, de)
    expect(f.id).not.toBe('x')
    expect(f.label).toBe('DE:Outcome')
    expect(f.options).toHaveLength(2)
    expect(newField('photos', existing, en).options).toBeUndefined()
  })

  it('payload: blank options are dropped, nothing else changes; null stays null', () => {
    const payload = draftToPayload({
      fields: [{ id: 'c', type: 'choice', label: 'Why', required: true, options: ['A', '', 'B', ' '] }],
    })
    expect(payload).toEqual({ fields: [{ id: 'c', type: 'choice', label: 'Why', required: true, options: ['A', 'B'] }] })
    expect(draftToPayload(null)).toBeNull()
  })

  it('a form is only re-sent when it changed', () => {
    const stored = { version: 3, fields: [{ id: 'n', type: 'note' as const, label: 'Notes', required: true }] }
    const a = draftFromStored(stored)
    const b = draftFromStored(stored)
    expect(draftChanged(a, b)).toBe(false)
    b!.fields[0]!.required = false
    expect(draftChanged(a, b)).toBe(true)
    expect(draftChanged(null, null)).toBe(false)
    expect(draftChanged(null, { fields: [] })).toBe(true)
  })

  it('legacy step: customise copies the field-service preset; ask nothing sends an empty list', () => {
    const step = { key: 'COMPLETED', isFinal: true, capabilities: ['report'] }
    expect(builderStepMode({ ...step, form: null }, 'Field Service')).toBe('legacy')

    const customised = presetDraft('fieldService', en)
    expect(customised.fields.map((f) => f.id)).toEqual(STEP_FORM_PRESETS.fieldService.fields.map((f) => f.id))
    expect(builderStepMode({ ...step, form: customised }, 'Field Service')).toBe('own')

    expect(draftToPayload(askNothingDraft())).toEqual({ fields: [] })
    expect(builderStepMode({ ...step, form: askNothingDraft() }, 'Field Service')).toBe('own')

    expect(builderStepMode({ key: 'ASSIGNED', capabilities: [], form: null }, 'Field Service')).toBe('none')
  })

  it('live validation names the field (the same validator the server runs)', () => {
    const errs = definitionErrors({
      fields: [
        { id: 'a', type: 'note', label: '', required: true },
        { id: 'b', type: 'choice', label: 'Pick', required: false, options: ['only one'] },
        { id: 'c', type: 'date', label: 'When', required: false, crm: 'followUp' },
        { id: 'd', type: 'date', label: 'Again', required: false, crm: 'followUp' },
      ],
    })
    expect(errs.a).toContain('label_required')
    expect(errs.b).toContain('options_required')
    expect(errs.d).toContain('crm_duplicate')
    expect(errs.c).toBeUndefined()
    expect(definitionErrors(null)).toEqual({})
  })

  it('a server refusal of the definition is mapped to its fields (by id, else by position)', () => {
    const fields = [{ id: 'a' }, { id: 'b' }]
    const err = coded('STEP_FORM_DEFINITION_INVALID', { errors: [{ index: 1, code: 'label_required' }, { fieldId: 'a', code: 'unknown_type' }] })
    expect(definitionRefusal(err, fields)).toEqual({ b: ['label_required'], a: ['unknown_type'] })
    expect(definitionRefusal(new Error('nope'), fields)).toBeNull()
  })
})

describe('mover', () => {
  const own = { fields: [{ id: 'why', type: 'choice', label: 'Why', required: true, options: ['A', 'B'] }], version: 1 }
  const wf = {
    name: 'Deliveries',
    statuses: [
      { key: 'FAILED', isFinal: false, capabilities: [], form: own },
      { key: 'COMPLETED', isFinal: true, capabilities: ['report'], form: null },
      { key: 'SILENT', isFinal: true, capabilities: ['report'], form: { version: 2, fields: [] } },
      { key: 'ASSIGNED', capabilities: [], form: null },
    ],
  }

  it("a step's own form is asked of ANY mover", () => {
    expect(stepFormForMove({ workflow: wf, statusKey: 'FAILED', isAssignee: false })?.source).toBe('own')
    expect(stepFormForMove({ workflow: wf, statusKey: 'FAILED', isAssignee: true })?.source).toBe('own')
  })

  it('the legacy report is asked only of the assignee', () => {
    expect(stepFormForMove({ workflow: wf, statusKey: 'COMPLETED', isAssignee: true })?.source).toBe('legacy')
    expect(stepFormForMove({ workflow: wf, statusKey: 'COMPLETED', isAssignee: false })).toBeNull()
  })

  it('"ask nothing" and a step with nothing to ask move straight through', () => {
    expect(stepFormForMove({ workflow: wf, statusKey: 'SILENT', isAssignee: true })).toBeNull()
    expect(stepFormForMove({ workflow: wf, statusKey: 'ASSIGNED', isAssignee: true })).toBeNull()
  })

  it('a job with no workflow is judged by key, like the server', () => {
    expect(stepFormForMove({ workflow: null, statusKey: 'COMPLETED', isAssignee: true })?.source).toBe('legacy')
    expect(stepFormForMove({ workflow: null, statusKey: 'IN_PROGRESS', isAssignee: true })).toBeNull()
  })
})

describe('answers', () => {
  const form = {
    fields: [
      { id: 'note', type: 'note' as const, label: 'Note', required: true },
      { id: 'pics', type: 'photos' as const, label: 'Photos', required: true },
      { id: 'sig', type: 'signature' as const, label: 'Sign', required: false },
      { id: 'n', type: 'number' as const, label: 'Meter', required: false },
      { id: 'ok', type: 'yesno' as const, label: 'OK', required: true },
    ],
  }

  it('builds answers from uploaded ids; empty optionals are left out; false is an answer', () => {
    const a = buildAnswers(form, {
      note: { kind: 'text', value: '  fixed it ' },
      pics: { kind: 'photos', items: [{ key: 'k1', uploadedId: 'att1' }, { key: 'k2', uploadedId: 'att2' }] },
      sig: { kind: 'signature', dataUrl: 'data:x', uploadedId: 'att3' },
      n: { kind: 'number', value: '12,5' },
      ok: { kind: 'yesno', value: false },
    })
    expect(a).toEqual({ note: 'fixed it', pics: ['att1', 'att2'], sig: 'att3', n: 12.5, ok: false })
    expect(checkAnswers(form, a)).toEqual({})
  })

  it('before upload, files are placeholders so the rest can be judged', () => {
    const a = buildAnswers(form, { pics: { kind: 'photos', items: [{ key: 'k1' }] }, n: { kind: 'number', value: '' } })
    expect(a.pics).toEqual([`${PENDING_FILE_PREFIX}k1`])
    expect(a.n).toBeUndefined()
    const errs = checkAnswers(form, a)
    expect(errs.note).toEqual(['required'])
    expect(errs.ok).toEqual(['required'])
    expect(errs.pics).toBeUndefined()
  })

  it('a refusal is mapped back to the fields — foreign files by the field holding them', () => {
    const sent = { note: 'x', pics: ['att1', 'att9'], sig: 'att3', ok: true }
    const invalid = coded(STEP_FORM_REFUSAL.INVALID, { statusKey: 'DONE', errors: [{ fieldId: 'note', code: 'too_long' }] })
    expect(answerRefusal(invalid, form, sent)).toEqual({ note: ['too_long'] })
    const foreign = coded(STEP_FORM_REFUSAL.FOREIGN_FILE, { statusKey: 'DONE', fileIds: ['att9'] })
    expect(answerRefusal(foreign, form, sent)).toEqual({ pics: ['invalid_file'] })
    expect(answerRefusal(new Error('network'), form, sent)).toBeNull()
    expect(isStepFormRefusal(foreign)).toBe(true)
    expect(isStepFormRefusal(new Error('x'))).toBe(false)
  })
})

describe('labels', () => {
  it("translates only the standard report's own fields, and only while they carry the preset's text", () => {
    expect(stepFieldLabel({ id: 'work_done', label: 'What you did' }, de)).toBe('DE:What you did')
    expect(stepFieldLabel({ id: 'work_done', label: 'Was gemacht wurde' }, de)).toBe('Was gemacht wurde')
    expect(stepFieldLabel({ id: 'f_abc', label: 'What you did' }, de)).toBe('What you did')
  })
})
