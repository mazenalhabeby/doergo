import {
  STEP_CAPABILITY_MODULE,
  TYPE_CAPABILITY_MODULE,
  CAPABILITY_MODULE,
  isStepCapability,
  isTypeCapability,
  modulesRequiredByWorkflow,
  missingModulesForWorkflow,
  explainModuleRequirement,
  normalizeTemplateStatuses,
  normalizeTypeCapabilities,
  AVAILABLE_MODULES,
} from '@hbcfield/shared';

/**
 * Capabilities come in two kinds, and conflating them produces nonsense.
 *
 * A STEP capability is a moment: record the route WHILE on the way. A TYPE
 * capability is true from creation to close: a task belongs to a sprint, it is
 * not "in a sprint at step three". Before the split, twelve of the eighteen
 * modules could not be declared by a task type at all, so nothing could warn
 * that Sprints was off when somebody built a Project flow.
 */
describe('the two levels', () => {
  it('keeps the sets disjoint — a capability is one kind or the other', () => {
    const step = Object.keys(STEP_CAPABILITY_MODULE);
    const type = Object.keys(TYPE_CAPABILITY_MODULE);
    expect(step.filter((k) => type.includes(k))).toEqual([]);
  });

  it('merges both into one lookup, so a refusal and a warning cannot disagree', () => {
    for (const k of Object.keys(STEP_CAPABILITY_MODULE)) {
      expect(CAPABILITY_MODULE[k]).toBe(STEP_CAPABILITY_MODULE[k]);
    }
    for (const k of Object.keys(TYPE_CAPABILITY_MODULE)) {
      expect(CAPABILITY_MODULE[k]).toBe(TYPE_CAPABILITY_MODULE[k]);
    }
  });

  it('only ever names modules that exist in the catalogue', () => {
    // A capability pointing at a module nobody can switch on could never be
    // satisfied — the task type would be permanently unofferable.
    const known = new Set<string>(AVAILABLE_MODULES.map((m) => m.key as string));
    for (const [cap, mod] of Object.entries(CAPABILITY_MODULE)) {
      expect(known.has(mod)).toBe(true);
      expect(typeof cap).toBe('string');
    }
  });

  it('classifies each key on exactly one side', () => {
    expect(isStepCapability('gps')).toBe(true);
    expect(isTypeCapability('gps')).toBe(false);
    expect(isTypeCapability('sprint')).toBe(true);
    expect(isStepCapability('sprint')).toBe(false);
    expect(isStepCapability('nonsense')).toBe(false);
    expect(isTypeCapability('nonsense')).toBe(false);
  });
});

describe('what a task type requires', () => {
  const statuses = [
    { name: 'On The Way', capabilities: ['gps', 'timer'] },
    { name: 'Done', capabilities: ['report'] },
  ];

  it('unions the steps and the type', () => {
    expect(modulesRequiredByWorkflow(statuses, ['sprint', 'subtasks'])).toEqual(
      ['service_reports', 'sprints', 'subtasks', 'time_tracking', 'tracking'],
    );
  });

  it('still works with no type capabilities at all', () => {
    expect(modulesRequiredByWorkflow(statuses)).toEqual(['service_reports', 'time_tracking', 'tracking']);
  });

  it('names what is missing, from either level', () => {
    const missing = missingModulesForWorkflow(statuses, ['tracking'], ['sprint']);
    expect(missing).toContain('sprints');
    expect(missing).toContain('time_tracking');
    expect(missing).not.toContain('tracking');
  });

  it('explains WHY each module is needed — the steps, or the type itself', () => {
    // "not allowed" sends someone hunting; naming the step or the type does not.
    expect(explainModuleRequirement(statuses, [], 'tracking')).toBe('On The Way');
    expect(explainModuleRequirement(statuses, ['sprint'], 'sprints')).toBe('this task type');
    expect(explainModuleRequirement(statuses, [], 'sprints')).toBe('');
  });
});

describe('normalization keeps the levels apart', () => {
  it('drops a type capability that someone put on a status', () => {
    // "at step three this task has a sprint" cannot be honoured at a moment.
    const out = normalizeTemplateStatuses([
      { name: 'A', key: 'A', isFinal: true, capabilities: ['gps', 'sprint', 'epic'] },
    ]);
    expect(out[0]!.capabilities).toEqual(['gps']);
  });

  it('drops a step capability that someone put on the type', () => {
    expect(normalizeTypeCapabilities(['sprint', 'gps', 'timer', 'crm'])).toEqual(['sprint', 'crm']);
  });

  it('refuses anything that is not a list of strings', () => {
    expect(normalizeTypeCapabilities(null)).toEqual([]);
    expect(normalizeTypeCapabilities('sprint')).toEqual([]);
    expect(normalizeTypeCapabilities([1, {}, null, 'SPRINT'])).toEqual(['sprint']);
  });
});
