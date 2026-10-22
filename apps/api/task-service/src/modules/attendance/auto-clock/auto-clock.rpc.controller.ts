import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AutoClockService } from './auto-clock.service';
import { AutoClockPlanService } from './auto-clock-plan.service';
import { AutoClockUndoService } from './auto-clock-undo.service';
import {
  pattern,
  type RpcRequest,
  autoClockPlan,
  autoClockConsent,
  autoClockUndo,
  autoClockSkipRest,
} from '@hbcfield/shared/microservices';

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

  @MessagePattern(pattern(autoClockPlan))
  autoClockPlan(@Payload() d: RpcRequest<typeof autoClockPlan>) {
    return this.planning.plan({ userId: d.userId, organizationId: d.organizationId });
  }

  @MessagePattern(pattern(autoClockConsent))
  autoClockConsent(@Payload() d: RpcRequest<typeof autoClockConsent>) {
    return this.autoClock.setConsent({
      userId: d.userId,
      organizationId: d.organizationId,
      consent: d.consent === true,
    });
  }

  @MessagePattern(pattern(autoClockUndo))
  autoClockUndo(@Payload() d: RpcRequest<typeof autoClockUndo>) {
    return this.undoing.undo(d);
  }

  @MessagePattern(pattern(autoClockSkipRest))
  autoClockSkipRest(@Payload() d: RpcRequest<typeof autoClockSkipRest>) {
    return this.undoing.skipRest(d);
  }
}
