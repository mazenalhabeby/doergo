import { STEP_FORM_LIMITS, STEP_FORM_REFUSAL, stepFormPreset, type StepForm, type StepFormField } from '@hbcfield/shared/client';
import {
  dayOf, draftAnswers, draftErrors, emptyDraft, errorKey, fieldLabel, filesToSend, finalAnswers, isoDay, pageComplete,
  paginateForm, parseNumber, prepareStepForm, reasonFromAnswers, refusalFieldErrors, shownAnswer, signatureFile, stillNeeded,
  type DraftPhoto, type FormDraft, type SentFile,
} from '@/features/job/step-form-logic';

/**
 * Step forms — the answers. The draft is judged by the SHARED rule the server
 * runs again; photos and signatures become attachment ids only once they are
 * queued, and a refusal maps back onto the fields it names.
 */

const f = (id: string, type: StepFormField['type'], required = false, extra: Partial<StepFormField> = {}): StepFormField => ({
  id, type, label: id, required, ...(type === 'choice' ? { options: ['Won', 'Lost'] } : {}), ...extra,
});
const form = (...fields: StepFormField[]): StepForm => ({ version: 1, fields });
const pic = (n: number): DraftPhoto => ({ uri: `file:///cache/p${n}.jpg`, fileName: `p${n}.jpg`, mimeType: 'image/jpeg', width: 10, height: 10 });

describe('the draft', () => {
  it('starts empty — a yes/no is a switch, so it already answers "no"', () => {
    const d = emptyDraft(form(f('n', 'note'), f('ok', 'yesno'), f('p', 'photos'), f('s', 'signature')));
    expect(d).toEqual({ n: '', ok: false, p: [], s: false });
    expect(draftAnswers(form(f('ok', 'yesno', true)), { ok: false })).toEqual({ ok: false });
  });

  it('the field-service report: each page opens only when its required fields are answered', () => {
    const fs = stepFormPreset('fieldService');
    const [did, photos, sign] = paginateForm(fs) as [StepFormField[], StepFormField[], StepFormField[]];
    const d: FormDraft = emptyDraft(fs);
    expect(pageComplete(fs, d, did)).toBe(false);
    expect(stillNeeded(fs, d, did).map((x) => x.id)).toEqual(['work_done']);
    d.work_done = 'Replaced the valve';
    expect(pageComplete(fs, d, did)).toBe(true);
    // The preset asks for before AND after photos — the server's contract.
    expect(pageComplete(fs, d, photos)).toBe(false);
    d.photos_before = [pic(1)];
    d.photos_after = [pic(2)];
    expect(pageComplete(fs, d, photos)).toBe(true);
    expect(stillNeeded(fs, d, sign).map((x) => x.id)).toEqual(['tech_signature', 'customer_name', 'customer_signature']);
    Object.assign(d, { tech_signature: true, customer_name: 'Anna Müller', customer_signature: true });
    expect(pageComplete(fs, d, fs.fields)).toBe(true);
  });

  it('a blank name is no name; a choice must be one of the options', () => {
    const fm = form(f('who', 'name', true), f('out', 'choice', true));
    expect(draftErrors(fm, { who: '   ', out: 'Won' })).toEqual({ who: 'required' });
    expect(draftErrors(fm, { who: 'Anna', out: 'Maybe' })).toEqual({ out: 'not_an_option' });
  });

  it('numbers read either decimal mark; anything else is refused as not a number', () => {
    expect(parseNumber('12,5')).toBe(12.5);
    expect(parseNumber(' 1 200 ')).toBe(1200);
    expect(parseNumber('-3')).toBe(-3);
    expect(parseNumber('12a')).toBe('12a');
    const fm = form(f('km', 'number'));
    expect(draftErrors(fm, { km: '12a' })).toEqual({ km: 'wrong_type' });
    expect(draftErrors(fm, { km: '1e12' })).toEqual({ km: 'wrong_type' });
    expect(draftErrors(fm, { km: String(STEP_FORM_LIMITS.maxNumber * 10) })).toEqual({ km: 'out_of_range' });
    expect(draftErrors(fm, { km: '' })).toEqual({});
  });

  it('a note past the limit is too long; a date must be a real day', () => {
    expect(draftErrors(form(f('n', 'note')), { n: 'x'.repeat(STEP_FORM_LIMITS.maxNoteLength + 1) })).toEqual({ n: 'too_long' });
    expect(draftErrors(form(f('d', 'date')), { d: '2026-02-30' })).toEqual({ d: 'invalid_date' });
    expect(isoDay(new Date(2026, 8, 7))).toBe('2026-09-07');
    expect(dayOf('2026-09-07')?.getDate()).toBe(7);
    expect(dayOf('2026-02-30')).toBeNull();
  });

  it('judges only the page it is asked about', () => {
    const fm = form(f('a', 'note', true), f('b', 'name', true));
    expect(draftErrors(fm, { a: '', b: '' }, [fm.fields[0]!])).toEqual({ a: 'required' });
  });
});

describe('sending — files first, their ids are the answers', () => {
  const fm = form(f('note', 'note', true), f('pics', 'photos', true), f('sig', 'signature', true), f('who', 'name'));
  const draft: FormDraft = { note: 'Done', pics: [pic(1), pic(2)], sig: true, who: 'Anna' };

  it('lists the files in the form\'s order: each photo, then each inked pad', () => {
    expect(filesToSend(fm, draft).map((x) => `${x.fieldId}:${x.kind}`)).toEqual(['pics:photo', 'pics:photo', 'sig:signature']);
    expect(filesToSend(fm, { ...draft, sig: false }).map((x) => x.kind)).toEqual(['photo', 'photo']);
  });

  it('a signature is sent as the PNG the pad drew', () => {
    const s = signatureFile('data:image/png;base64,AAA', 42);
    expect(s).toMatchObject({ uri: 'data:image/png;base64,AAA', mimeType: 'image/png', fileName: 'signature_42.png' });
  });

  it('the answers carry the queued attachment ids, and the move waits for the unsent ones', async () => {
    const sentFiles: DraftPhoto[] = [];
    let n = 0;
    const send = async (file: DraftPhoto): Promise<SentFile> => {
      sentFiles.push(file);
      n += 1;
      return { id: `att-${n}`, waitFor: n === 2 ? null : `op-${n}`, outcome: { kind: n === 2 ? 'done' : 'queued' } };
    };
    const res = await prepareStepForm({ form: fm, draft, signatures: { sig: 'data:image/png;base64,SIG' }, sent: new Map(), send });
    expect(res).toEqual({
      ok: true,
      answers: { note: 'Done', pics: ['att-1', 'att-2'], sig: 'att-3', who: 'Anna' },
      dependsOn: ['op-1', 'op-3'],
      queuedFiles: true,
    });
    expect(sentFiles.map((x) => x.mimeType)).toEqual(['image/jpeg', 'image/jpeg', 'image/png']);
  });

  it('sending again after a refusal does not put the same photos on the job twice', async () => {
    const sent = new Map<string, { id: string; waitFor: string | null }>();
    let calls = 0;
    const send = async (): Promise<SentFile> => ({ id: `att-${++calls}`, waitFor: null, outcome: { kind: 'done' } });
    await prepareStepForm({ form: fm, draft, signatures: { sig: 'data:image/png;base64,SIG' }, sent, send });
    const again = await prepareStepForm({ form: fm, draft, signatures: { sig: 'data:image/png;base64,SIG' }, sent, send });
    expect(calls).toBe(3);
    expect(again.ok && again.answers.pics).toEqual(['att-1', 'att-2']);
  });

  it('a file the server refuses stops the move and points at its field', async () => {
    const send = async (): Promise<SentFile> => ({ id: null, waitFor: null, outcome: { kind: 'refused', code: 'PHOTO_REFUSED' } });
    const res = await prepareStepForm({ form: fm, draft, signatures: {}, sent: new Map(), send });
    expect(res).toEqual({ ok: false, fieldErrors: { pics: 'invalid_file' }, refused: { code: 'PHOTO_REFUSED', message: undefined } });
  });

  it('an inked pad with no picture is a missing signature, not a blank one sent', async () => {
    const send = async (): Promise<SentFile> => ({ id: 'x', waitFor: null, outcome: { kind: 'done' } });
    const res = await prepareStepForm({ form: form(f('sig', 'signature', true)), draft: { sig: true }, signatures: {}, sent: new Map(), send });
    expect(res).toEqual({ ok: false, fieldErrors: { sig: 'required' } });
  });

  it('the final answers are cleaned by the shared rule', () => {
    expect(finalAnswers(form(f('n', 'note')), { n: '  hi  ' }, {})).toEqual({ ok: true, answers: { n: 'hi' } });
    expect(finalAnswers(form(f('p', 'photos', true)), { p: [] }, {})).toEqual({ ok: false, errors: { p: 'required' } });
  });

  it('a Blocked form still says why — the first note, else the choice', () => {
    expect(reasonFromAnswers(form(f('why', 'choice'), f('n', 'note')), { why: 'Won', n: 'Door locked' })).toBe('Door locked');
    expect(reasonFromAnswers(form(f('why', 'choice')), { why: 'Won' })).toBe('Won');
    expect(reasonFromAnswers(form(f('ok', 'yesno')), { ok: true })).toBeUndefined();
  });
});

describe('refusals — back onto the fields', () => {
  it('STEP_FORM_INVALID names fields and codes', () => {
    const errs = refusalFieldErrors({ code: STEP_FORM_REFUSAL.INVALID, params: { statusKey: 'DONE', errors: [{ fieldId: 'who', code: 'required' }, { fieldId: 'km', code: 'out_of_range' }, { fieldId: 'who', code: 'too_long' }] } });
    expect(errs).toEqual({ who: 'required', km: 'out_of_range' });
    expect(refusalFieldErrors({ code: STEP_FORM_REFUSAL.INVALID, params: {} })).toEqual({ '*': 'invalid' });
  });

  it('STEP_FORM_FOREIGN_FILE points at the fields that named those files', () => {
    const sent = { pics: ['a1', 'a2'], sig: 'a3', note: 'a2' };
    expect(refusalFieldErrors({ code: STEP_FORM_REFUSAL.FOREIGN_FILE, params: { fileIds: ['a2', 'a3'] } }, sent)).toEqual({ pics: 'invalid_file', sig: 'invalid_file', note: 'invalid_file' });
    expect(refusalFieldErrors({ code: STEP_FORM_REFUSAL.FOREIGN_FILE, params: { fileIds: ['zz'] } }, sent)).toEqual({ '*': 'invalid_file' });
  });

  it('any other refusal is not a form problem', () => {
    expect(refusalFieldErrors({ code: 'TASK_STATE_CONFLICT' })).toBeNull();
    expect(refusalFieldErrors({})).toBeNull();
  });

  it('every code has a sentence; an unknown one reads as the general one', () => {
    for (const c of ['required', 'wrong_type', 'too_long', 'too_many', 'not_an_option', 'out_of_range', 'invalid_date', 'invalid_file', 'unknown_field']) {
      expect(errorKey(c)).toBe(`job.form.error.${c}`);
    }
    expect(errorKey('something_new')).toBe('job.form.error.invalid');
  });
});

describe('labels — the organization\'s words, the preset\'s translated', () => {
  const t = (k: string) => `T(${k})`;
  it('translates the field-service preset while its label is the English default', () => {
    for (const x of stepFormPreset('fieldService').fields) expect(fieldLabel(x, t)).toMatch(/^T\(job\.finish\./);
  });
  it('shows an edited label, and every other form\'s label, as written', () => {
    expect(fieldLabel({ id: 'work_done', label: 'Arbeiten erledigt' }, t)).toBe('Arbeiten erledigt');
    expect(fieldLabel({ id: 'received_by', label: 'Received by' }, t)).toBe('Received by');
  });
});

describe('reading a report', () => {
  it('shows each answer by its type, and nothing for an unanswered field', () => {
    expect(shownAnswer({ type: 'note' }, 'hi')).toEqual({ kind: 'text', text: 'hi' });
    expect(shownAnswer({ type: 'number' }, 12.5)).toEqual({ kind: 'text', text: '12.5' });
    expect(shownAnswer({ type: 'yesno' }, false)).toEqual({ kind: 'yesno', value: false });
    expect(shownAnswer({ type: 'photos' }, ['a', 'b'])).toEqual({ kind: 'photos', ids: ['a', 'b'] });
    expect(shownAnswer({ type: 'signature' }, 's1')).toEqual({ kind: 'signature', id: 's1' });
    expect(shownAnswer({ type: 'note' }, undefined)).toBeNull();
    expect(shownAnswer({ type: 'photos' }, [])).toBeNull();
  });
});
