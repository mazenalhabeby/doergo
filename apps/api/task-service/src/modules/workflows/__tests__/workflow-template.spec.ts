import {
  normalizeTemplateStatuses,
  normalizeStatusKey,
  validateWorkflow,
  TEMPLATE_LIMITS,
  WORKFLOW_TEMPLATES,
} from '@hbcfield/shared';

/**
 * A library template is the one piece of workflow data written by a different
 * party than the one using it: the platform curates it, every tenant copies it,
 * and it is stored as JSON, which has no schema.
 *
 * So `normalizeTemplateStatuses` is a trust boundary, not a formatter. These
 * assert what may cross it — and, as importantly, that what crosses is still
 * the workflow the curator meant.
 */
describe('normalizeTemplateStatuses', () => {
  it('keeps a well-formed template intact', () => {
    const out = normalizeTemplateStatuses([
      { name: 'New', key: 'NEW', color: '#2563EB', position: 0, isFinal: false, isCanceled: false, transitions: ['DONE'], capabilities: ['gps'] },
      { name: 'Done', key: 'DONE', color: '#16A34A', position: 1, isFinal: true, isCanceled: false, transitions: [], capabilities: [] },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ key: 'NEW', name: 'New', color: '#2563EB', transitions: ['DONE'], capabilities: ['gps'] });
    expect(out[1]).toMatchObject({ key: 'DONE', isFinal: true });
  });

  it('refuses anything that is not a list', () => {
    for (const junk of [null, undefined, {}, 'statuses', 42]) {
      expect(normalizeTemplateStatuses(junk)).toEqual([]);
    }
  });

  it('drops a status with no usable key — it could not be stored on a task', () => {
    const out = normalizeTemplateStatuses([
      { name: 'Nameless', key: '!!!', transitions: [] },
      { name: 'Real', key: 'REAL', isFinal: true, transitions: [] },
    ]);
    expect(out.map((s) => s.key)).toEqual(['REAL']);
  });

  it('keeps the first of two statuses sharing a key', () => {
    // A duplicate makes "which step is this?" unanswerable: a task's status
    // would match two rows carrying different rules.
    const out = normalizeTemplateStatuses([
      { name: 'First', key: 'DUP', transitions: [] },
      { name: 'Second', key: 'DUP', transitions: [] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('First');
  });

  it('normalizes keys the same way in a status and in a transition naming it', () => {
    // If these disagreed, every transition would silently become a dead end.
    const out = normalizeTemplateStatuses([
      { name: 'In progress', key: 'in progress', transitions: ['on-hold'] },
      { name: 'On hold', key: 'on-hold', isFinal: true, transitions: [] },
    ]);
    expect(out[0]!.key).toBe('IN_PROGRESS');
    expect(out[0]!.transitions).toEqual(['ON_HOLD']);
    expect(out[1]!.key).toBe('ON_HOLD');
    expect(validateWorkflow(out)).toEqual([]);
  });

  it('drops a capability nothing maps to', () => {
    // An unknown capability names a module that does not exist, so it could
    // never be satisfied — a workflow carrying one could never be attached.
    const out = normalizeTemplateStatuses([
      { name: 'Step', key: 'STEP', isFinal: true, capabilities: ['gps', 'mind_reading', 'GPS', 7] },
    ]);
    expect(out[0]!.capabilities).toEqual(['gps']);
  });

  it('replaces a colour that is not a hex triple rather than storing it', () => {
    const out = normalizeTemplateStatuses([
      { name: 'A', key: 'A', color: 'javascript:alert(1)', isFinal: true },
      { name: 'B', key: 'B', color: '#ABCDEF', isFinal: true },
    ]);
    expect(out[0]!.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(out[0]!.color).not.toContain('javascript');
    expect(out[1]!.color).toBe('#ABCDEF');
  });

  it('drops an icon name outside the icon alphabet', () => {
    const out = normalizeTemplateStatuses([
      { name: 'A', key: 'A', icon: '../../etc/passwd', isFinal: true },
      { name: 'B', key: 'B', icon: 'checkmark', isFinal: true },
    ]);
    expect(out[0]!.icon).toBeUndefined();
    expect(out[1]!.icon).toBe('checkmark');
  });

  it('bounds a definition that would otherwise cost a tenant unbounded writes', () => {
    const huge = Array.from({ length: 500 }, (_, i) => ({ name: `S${i}`, key: `S${i}`, transitions: [] }));
    expect(normalizeTemplateStatuses(huge)).toHaveLength(TEMPLATE_LIMITS.maxStatuses);

    const manyTransitions = normalizeTemplateStatuses([
      { name: 'A', key: 'A', transitions: Array.from({ length: 500 }, (_, i) => `T${i}`) },
    ]);
    expect(manyTransitions[0]!.transitions.length).toBeLessThanOrEqual(TEMPLATE_LIMITS.maxTransitionsPerStatus);
  });

  it('truncates a name instead of storing an arbitrarily long one', () => {
    const out = normalizeTemplateStatuses([{ name: 'x'.repeat(5000), key: 'A', isFinal: true }]);
    expect(out[0]!.name.length).toBe(TEMPLATE_LIMITS.maxNameLength);
  });

  it('renumbers positions from the given order, so the entry step is not an accident', () => {
    // Every task starts at the lowest position. Duplicate or sparse positions
    // would otherwise let the template pick its own starting step by luck.
    const out = normalizeTemplateStatuses([
      { name: 'Second', key: 'B', position: 9 },
      { name: 'First', key: 'A', position: 2 },
      { name: 'Third', key: 'C', position: 9 },
    ]);
    expect(out.map((s) => s.key)).toEqual(['A', 'B', 'C']);
    expect(out.map((s) => s.position)).toEqual([0, 1, 2]);
  });

  it('treats a missing flag as false rather than truthy', () => {
    const out = normalizeTemplateStatuses([{ name: 'A', key: 'A', isFinal: 'yes', isCanceled: 1 }]);
    expect(out[0]!.isFinal).toBe(false);
    expect(out[0]!.isCanceled).toBe(false);
  });
});

describe('normalizeStatusKey', () => {
  it('produces a key that survives being stored and compared', () => {
    expect(normalizeStatusKey(' en route ')).toBe('EN_ROUTE');
    expect(normalizeStatusKey('on-hold')).toBe('ON_HOLD');
    expect(normalizeStatusKey('Robert"); DROP TABLE--')).toBe('ROBERT_DROP_TABLE');
    expect(normalizeStatusKey(null)).toBe('');
    expect(normalizeStatusKey(123)).toBe('');
  });
});

/**
 * The shipped templates are seeded straight into the library and offered to
 * every tenant, so an unsound one would be handed out at scale before anyone
 * noticed. They go through exactly the path a stored row does.
 */
describe('the built-in templates', () => {
  it.each(WORKFLOW_TEMPLATES.map((t) => [t.id, t] as const))('%s survives normalization and is usable', (_id, tpl) => {
    const normalized = normalizeTemplateStatuses(tpl.statuses);
    expect(normalized).toHaveLength(tpl.statuses.length);
    expect(validateWorkflow(normalized)).toEqual([]);
  });

  it('has no two templates claiming the same slug', () => {
    const slugs = WORKFLOW_TEMPLATES.map((t) => t.id);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
