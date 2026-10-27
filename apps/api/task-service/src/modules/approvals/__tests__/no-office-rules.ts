import type { ApprovalRulesService } from '../rules/approval-rules.service';

/**
 * Office rules for a test that is not about them: no rule applies, so every decision finishes at once.
 * The approve paths take the rules service as a REQUIRED dependency now — a missing one used to skip the gate.
 */
export function noOfficeRules(): ApprovalRulesService {
  return {
    gate: jest.fn(async () => ({ finalize: true })),
    firstStep: jest.fn(async () => null),
    clear: jest.fn(async () => undefined),
    reopen: jest.fn(async () => undefined),
    steps: jest.fn(async () => []),
    secondStepFor: jest.fn(async () => null),
  } as unknown as ApprovalRulesService;
}
