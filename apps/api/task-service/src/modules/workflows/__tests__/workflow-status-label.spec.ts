import { workflowStatusLabel, workflowStatusKey, normalizeTemplateStatuses } from '@hbcfield/shared';

/**
 * A status name is tenant data — someone typed it — so it cannot live in a
 * locale file. But most names are never typed: they arrive from a shipped
 * template in English, and an organisation working in German then reads
 * "On The Way" forever inside an otherwise German app.
 *
 * The answer is a key stored NEXT TO the name, not a translation of it. These
 * assert the two halves of that: a shipped name translates, and a name a person
 * wrote is left exactly as they wrote it.
 */
describe('workflowStatusLabel', () => {
  /*
    Records what it was ASKED, not just what it returned.

    A first version only knew one word and returned the default for everything
    else — which cannot tell "never consulted" from "consulted and fell back".
    Translating a name a person wrote passed it happily, because there is no
    translation for "Auf dem Hof" either. The invariant is that the translator
    is never asked about a name somebody typed.
  */
  let asked: string[] = [];
  beforeEach(() => { asked = []; });
  const t = (key: string, opts: { defaultValue: string }) => {
    asked.push(key);
    return key === 'workflowStatus.en_route' ? 'Unterwegs' : opts.defaultValue;
  };

  it('translates a step that came from a shipped template', () => {
    expect(workflowStatusLabel({ name: 'On The Way', nameKey: 'workflowStatus.en_route' }, t)).toBe('Unterwegs');
  });

  it('leaves a name a person wrote exactly as they wrote it', () => {
    // Replacing their word with ours is worse than showing an English default.
    expect(workflowStatusLabel({ name: 'Auf dem Hof' }, t)).toBe('Auf dem Hof');
    expect(workflowStatusLabel({ name: 'Auf dem Hof', nameKey: null }, t)).toBe('Auf dem Hof');
    // And is not even looked up — the difference a returning-the-default
    // translator cannot show.
    expect(asked).toEqual([]);
  });

  it('falls back to the stored name when the language has no word for it', () => {
    // A missing translation must degrade to English, never to the raw key.
    expect(workflowStatusLabel({ name: 'Arrived', nameKey: 'workflowStatus.arrived' }, t)).toBe('Arrived');
  });

  it('survives a missing status without throwing', () => {
    expect(workflowStatusLabel(null, t)).toBe('');
    expect(workflowStatusLabel(undefined, t)).toBe('');
  });

  it('derives the same key from a status key however it is cased', () => {
    expect(workflowStatusKey('EN_ROUTE')).toBe('workflowStatus.en_route');
    expect(workflowStatusKey(' en_route ')).toBe('workflowStatus.en_route');
  });

  it('gives every shipped template step a key, so none of them stay English', () => {
    const statuses = normalizeTemplateStatuses([
      { name: 'On The Way', key: 'EN_ROUTE', isFinal: false },
      { name: 'Done', key: 'DONE', isFinal: true },
    ]);
    expect(statuses.map((s) => s.nameKey)).toEqual(['workflowStatus.en_route', 'workflowStatus.done']);
  });
});
