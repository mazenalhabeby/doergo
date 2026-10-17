import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AutoClockService } from './auto-clock.service';
import type { OccurrenceEvidence } from '@hbcfield/shared';
import { AutoClockPlanService } from './auto-clock-plan.service';
import { AutoClockUndoService } from './auto-clock-undo.service';

/** The automatic clock over RPC: plan, consent, undo, skip the rest. */
@Controller()
export class AutoClockRpcController {
  constructor(
    private readonly autoClock: AutoClockService,
    private readonly undoing: AutoClockUndoService,
    private readonly planning: AutoClockPlanService,
  ) {}

  // ── Shift reminder responses (worker actions + leader approval) ──
  // ── The automatic clock (attendance/auto-clock.ts) — always the caller's own ──

  @MessagePattern({ cmd: 'auto_clock_plan' })
  autoClockPlan(@Payload() d: { userId: string; organizationId: string }) {
    return this.planning.plan({ userId: d.userId, organizationId: d.organizationId });
  }

  @MessagePattern({ cmd: 'auto_clock_consent' })
  autoClockConsent(@Payload() d: { userId: string; organizationId: string; consent: boolean }) {
    return this.autoClock.setConsent({ userId: d.userId, organizationId: d.organizationId, consent: d.consent === true });
  }

  @MessagePattern({ cmd: 'auto_clock_undo' })
  autoClockUndo(@Payload() d: { userId: string; organizationId: string; entryId: string; evidence?: OccurrenceEvidence }) {
    return this.undoing.undo(d);
  }

  @MessagePattern({ cmd: 'auto_clock_skip_rest' })
  autoClockSkipRest(@Payload() d: { userId: string; organizationId: string; entryId: string; evidence?: OccurrenceEvidence }) {
    return this.undoing.skipRest(d);
  }
}
