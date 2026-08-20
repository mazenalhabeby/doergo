import {
  modulesRequiredByWorkflow,
  missingModulesForWorkflow,
  statusesRequiringModule,
  CAPABILITY_MODULE,
} from '@hbcfield/shared';

/**
 * A workflow only works where the space has switched on what its steps need.
 *
 * The requirement is derived from the statuses' own capabilities rather than
 * declared beside them, so a workflow that gains a GPS step gains its
 * requirement in the same edit and nobody has to keep a second list in step.
 */
describe('what a workflow requires of a space', () => {
  const enRoute = { name: 'En route', capabilities: ['gps'] };
  const working = { name: 'Working', capabilities: ['timer', 'checklist'] };
  const signOff = { name: 'Sign off', capabilities: ['signature', 'report'] };
  const plain = { name: 'New', capabilities: [] };

  describe('modulesRequiredByWorkflow', () => {
    it('asks for nothing when no step needs anything', () => {
      expect(modulesRequiredByWorkflow([plain])).toEqual([]);
      expect(modulesRequiredByWorkflow([])).toEqual([]);
      expect(modulesRequiredByWorkflow(null)).toEqual([]);
    });

    it('derives the module from a step capability', () => {
      expect(modulesRequiredByWorkflow([enRoute])).toEqual(['tracking']);
    });

    it('collects across every step, de-duplicated and sorted', () => {
      expect(modulesRequiredByWorkflow([plain, enRoute, working, signOff])).toEqual([
        'checklists', 'service_reports', 'time_tracking', 'tracking',
      ]);
    });

    it('counts two capabilities served by one module once', () => {
      // signature and report both live under service_reports.
      expect(modulesRequiredByWorkflow([signOff])).toEqual(['service_reports']);
    });

    it('ignores a capability with no module behind it', () => {
      // An unknown value must not become a requirement nobody can satisfy —
      // that would make the workflow permanently unattachable.
      expect(modulesRequiredByWorkflow([{ name: 'X', capabilities: ['teleport'] }])).toEqual([]);
    });
  });

  describe('missingModulesForWorkflow', () => {
    it('is empty when the space has everything', () => {
      expect(missingModulesForWorkflow([enRoute, working], ['tracking', 'time_tracking', 'checklists'])).toEqual([]);
    });

    it('names what is missing, so the refusal can be acted on', () => {
      expect(missingModulesForWorkflow([enRoute, working], ['checklists'])).toEqual(['time_tracking', 'tracking']);
    });

    it('treats a space with no modules as missing all of them', () => {
      expect(missingModulesForWorkflow([enRoute], null)).toEqual(['tracking']);
      expect(missingModulesForWorkflow([enRoute], [])).toEqual(['tracking']);
    });

    it('lets a workflow with no requirements attach anywhere', () => {
      expect(missingModulesForWorkflow([plain], [])).toEqual([]);
    });
  });

  describe('statusesRequiringModule', () => {
    it('points at the steps responsible, not the whole workflow', () => {
      expect(statusesRequiringModule([enRoute, working, signOff], 'service_reports')).toEqual(['Sign off']);
    });

    it('lists every step that needs it', () => {
      const twoGps = [enRoute, { name: 'Returning', capabilities: ['gps'] }];
      expect(statusesRequiringModule(twoGps, 'tracking')).toEqual(['En route', 'Returning']);
    });

    it('is empty for a module nothing needs', () => {
      expect(statusesRequiringModule([enRoute], 'crm')).toEqual([]);
    });
  });

  it('maps every capability the product uses', () => {
    // If a new capability is added to a status without a module behind it, this
    // fails and someone decides deliberately rather than it silently requiring
    // nothing.
    for (const cap of ['gps', 'timer', 'checklist', 'photos', 'report', 'signature', 'form']) {
      expect(CAPABILITY_MODULE[cap]).toBeTruthy();
    }
  });
});
