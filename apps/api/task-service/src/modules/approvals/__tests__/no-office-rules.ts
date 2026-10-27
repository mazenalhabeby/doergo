import { ApprovalRulesService } from '../rules/approval-rules.service';

/**
 * Office rules for a test that is not about them: no rule applies, so every decision finishes at once.
 * The approve paths take the rules service as a REQUIRED dependency now — a missing one used to skip the gate.
 */
export function noOfficeRules(): ApprovalRulesService {
  return {
    gate: jest.fn(async () => ({ finalize: true })),
    decide: jest.fn(async (_input: unknown, write: () => unknown) => ({ done: await write() })),
    asksAboutCover: jest.fn(async () => false),
    clear: jest.fn(async () => undefined),
    clearItem: jest.fn(async () => undefined),
    reopen: jest.fn(async () => undefined),
    steps: jest.fn(async () => []),
    secondStepFor: jest.fn(async () => null),
  } as unknown as ApprovalRulesService;
}

/**
 * Office rules driven by a `gate` the test controls, with the REAL decide(): a step 1 writes nothing, a finished
 * decision writes, and a write that fails opens the step again (`reopen`).
 */
export function rulesFromGate(gate: jest.Mock) {
  const rules = { gate, clear: jest.fn(), reopen: jest.fn(), decide: undefined as unknown };
  rules.decide = (input: unknown, write: (m?: number) => Promise<unknown>) =>
    ApprovalRulesService.prototype.decide.call(rules as never, input as never, write);
  return rules as typeof rules & { decide: ApprovalRulesService['decide'] };
}
