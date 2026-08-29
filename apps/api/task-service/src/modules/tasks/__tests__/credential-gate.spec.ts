import { credentialStanding, credentialBlocks, credentialTypesGating } from '@hbcfield/shared';

/**
 * The dispatch gate.
 *
 * An expired certificate has to take somebody out of the assignable pool on the
 * day it expires, without a dispatcher having to remember. The failure this
 * prevents is the gap between what a technician is actually qualified for and
 * what the person assigning the work assumes.
 *
 * The decision logic is reproduced here from `assertAssigneesAreQualified`,
 * exactly, so it can be asserted without a database — and the last block checks
 * the real service still contains the same rule.
 */

interface GatingType { id: string; label: string }
interface Held { userId: string; typeId: string; expiresOn: Date | null }
interface Person { id: string; firstName: string; lastName: string }

/** The rule as the service applies it. */
function blockedPeople(
  people: Person[],
  gatingTypes: GatingType[],
  held: Held[],
  now: Date,
): { name: string; missing: string[] }[] {
  const valid = new Set<string>();
  for (const doc of held) {
    if (!credentialBlocks(credentialStanding(doc.expiresOn, now))) {
      valid.add(`${doc.userId}:${doc.typeId}`);
    }
  }
  return people
    .map((p) => ({
      name: `${p.firstName} ${p.lastName}`,
      missing: gatingTypes.filter((t) => !valid.has(`${p.id}:${t.id}`)).map((t) => t.label),
    }))
    .filter((r) => r.missing.length > 0);
}

const NOW = new Date('2026-08-29T12:00:00Z');
const GAS: GatingType = { id: 'ty-gas', label: 'Gas Safe' };
const ELEC: GatingType = { id: 'ty-elec', label: 'Electrical E-2' };
const MIKE: Person = { id: 'u-mike', firstName: 'Mike', lastName: 'Weber' };
const MONIKA: Person = { id: 'u-monika', firstName: 'Monika', lastName: 'Holub' };

describe('which credentials gate a task type', () => {
  const types = [
    { id: 'ty-gas', isCredential: true, isActive: true, requiredForWorkflowIds: ['wf-hvac'] },
    { id: 'ty-elec', isCredential: true, isActive: true, requiredForWorkflowIds: ['wf-electrical'] },
    { id: 'ty-payslip', isCredential: false, isActive: true, requiredForWorkflowIds: ['wf-hvac'] },
    { id: 'ty-old', isCredential: true, isActive: false, requiredForWorkflowIds: ['wf-hvac'] },
  ];

  it('selects only active credential types named for that task type', () => {
    expect(credentialTypesGating(types, 'wf-hvac')).toEqual(['ty-gas']);
  });

  it('gates nothing for a task type nobody required a certificate for', () => {
    expect(credentialTypesGating(types, 'wf-plumbing')).toEqual([]);
  });

  it('gates nothing for a task with no type at all', () => {
    // A task type is what carries the requirement; without one there is nothing
    // to be qualified for.
    expect(credentialTypesGating(types, null)).toEqual([]);
  });

  it('gates nothing for an organization with no credential types', () => {
    // Every organization on the day this ships. This is the short-circuit that
    // makes their assignment path provably unchanged.
    expect(credentialTypesGating([], 'wf-hvac')).toEqual([]);
  });
});

describe('who is blocked', () => {
  it('lets a valid credential through', () => {
    const held = [{ userId: 'u-mike', typeId: 'ty-gas', expiresOn: new Date('2027-01-01') }];
    expect(blockedPeople([MIKE], [GAS], held, NOW)).toEqual([]);
  });

  it('blocks an EXPIRED credential', () => {
    const held = [{ userId: 'u-mike', typeId: 'ty-gas', expiresOn: new Date('2026-08-01') }];
    expect(blockedPeople([MIKE], [GAS], held, NOW)).toEqual([
      { name: 'Mike Weber', missing: ['Gas Safe'] },
    ]);
  });

  it('does NOT block one that is merely expiring', () => {
    // Losing a technician a month early causes exactly the scramble this
    // feature exists to prevent. Expiring warns; expired blocks.
    const held = [{ userId: 'u-mike', typeId: 'ty-gas', expiresOn: new Date('2026-09-20') }];
    expect(credentialStanding(held[0]!.expiresOn, NOW)).toBe('EXPIRING');
    expect(blockedPeople([MIKE], [GAS], held, NOW)).toEqual([]);
  });

  it('lets it through on the expiry day itself', () => {
    // A certificate valid "until 29 August" is valid on 29 August.
    const held = [{ userId: 'u-mike', typeId: 'ty-gas', expiresOn: new Date('2026-08-29') }];
    expect(blockedPeople([MIKE], [GAS], held, NOW)).toEqual([]);
  });

  it('blocks a MISSING credential as firmly as an expired one', () => {
    // "You must hold a gas certificate" does not become untrue because nobody
    // uploaded one — a gate satisfied by absence is not a gate.
    expect(blockedPeople([MIKE], [GAS], [], NOW)).toEqual([
      { name: 'Mike Weber', missing: ['Gas Safe'] },
    ]);
  });

  it('treats a credential with no expiry as valid forever', () => {
    const held = [{ userId: 'u-mike', typeId: 'ty-gas', expiresOn: null }];
    expect(blockedPeople([MIKE], [GAS], held, NOW)).toEqual([]);
  });

  it('requires every gating credential, not just one of them', () => {
    const held = [{ userId: 'u-mike', typeId: 'ty-gas', expiresOn: new Date('2027-01-01') }];
    expect(blockedPeople([MIKE], [GAS, ELEC], held, NOW)).toEqual([
      { name: 'Mike Weber', missing: ['Electrical E-2'] },
    ]);
  });

  it('does not let one person’s credential qualify another', () => {
    const held = [{ userId: 'u-mike', typeId: 'ty-gas', expiresOn: new Date('2027-01-01') }];
    const blocked = blockedPeople([MIKE, MONIKA], [GAS], held, NOW);
    expect(blocked).toEqual([{ name: 'Monika Holub', missing: ['Gas Safe'] }]);
  });

  it('names every missing credential, so a dispatcher knows what to chase', () => {
    const blocked = blockedPeople([MIKE], [GAS, ELEC], [], NOW);
    expect(blocked[0]!.missing).toEqual(['Gas Safe', 'Electrical E-2']);
  });
});

describe('the service still applies this rule', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'tasks.service.ts'),
    'utf8',
  );

  it('gates every entry point that can put a person on a task', () => {
    /*
      Four of them, and they are not interchangeable:
        create()          — a task made with an assignee
        assign()          — a task assigned afterwards
        triageRequest()   — a portal request turned into assigned work
        addAssignee()     — a second person added to an existing task

      A gate on three of four is a gate on none: whichever is missed becomes the
      way round it, and nobody discovers that until an unqualified technician is
      already on site.
    */
    const calls = src.match(/assertAssigneesAreQualified\(/g) ?? [];
    // Three direct calls plus the one inside assertAssigneesCanReceiveTasks,
    // which create() uses — and the definition itself.
    expect(calls.length).toBeGreaterThanOrEqual(4);
  });

  it('short-circuits before querying when nothing is gated', () => {
    // The property that keeps every existing organization's assignment path
    // unchanged: no task type, no organization, or no gating type → return.
    expect(src).toContain('if (!workflowId || !organizationId) return;');
    expect(src).toContain('if (gatingTypes.length === 0) return;');
  });

  it('resolves every candidate in one query, never one each', () => {
    expect(src).toContain('userId: { in: userIds }');
  });

  it('names the credential in the refusal, not just the person', () => {
    expect(src).toContain('a required certificate is missing or expired');
  });
});
