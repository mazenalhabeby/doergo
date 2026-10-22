import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { BreakService } from './break.service';
import { BreakRulesService } from '../core/break-rules.service';
import { BreakStatusService } from './break-status.service';
import { BreakReadService } from './break-read.service';
import { OfficeBreaksService } from './office-breaks.service';
import {
  pattern,
  type RpcRequest,
  startBreak,
  snoozeBreak,
  listBreakRules,
  createBreakRule,
  updateBreakRule,
  deleteBreakRule,
  endBreak,
  getBreakStatus,
  getBreaksForEntry,
  getActiveBreaks,
  getBreakHistory,
  addBreakForMember,
  deleteBreak,
  endBreakManually,
  getBreakSummary,
} from '@hbcfield/shared/microservices';

/** Rests over RPC: taking one, the prompt, the rules, reading and correcting them. */
@Controller()
export class BreaksRpcController {
  constructor(
    private readonly breakService: BreakService,
    private readonly officeBreaks: OfficeBreaksService,
    private readonly breakRead: BreakReadService,
    private readonly breakStatus: BreakStatusService,
    private readonly breakRules: BreakRulesService,
  ) {}

  // =========================================================================
  // BREAKS
  // =========================================================================

  @MessagePattern(pattern(startBreak))
  async startBreak(
    @Payload()
    data: RpcRequest<typeof startBreak>,
  ) {
    // `reason` marks a rest the SYSTEM started (rest-away.service) — never taken from a request.
    const { reason: _systemOnly, ...tap } = data as RpcRequest<typeof startBreak> & { reason?: unknown };
    return this.breakService.startBreak(tap);
  }

  /** "Later." Moves the rest out by its own interval; the COUNT is kept here. */
  @MessagePattern(pattern(snoozeBreak))
  async snoozeBreak(@Payload() data: RpcRequest<typeof snoozeBreak>) {
    return this.breakStatus.snoozeBreak(data);
  }

  // =========================================================================
  // REST RULES — the workspace's planned rests
  // =========================================================================

  @MessagePattern(pattern(listBreakRules))
  async listBreakRules(@Payload() data: RpcRequest<typeof listBreakRules>) {
    return this.breakRules.list(data);
  }

  @MessagePattern(pattern(createBreakRule))
  async createBreakRule(@Payload() data: RpcRequest<typeof createBreakRule>) {
    return this.breakRules.create(data);
  }

  @MessagePattern(pattern(updateBreakRule))
  async updateBreakRule(@Payload() data: RpcRequest<typeof updateBreakRule>) {
    return this.breakRules.update(data);
  }

  @MessagePattern(pattern(deleteBreakRule))
  async deleteBreakRule(@Payload() data: RpcRequest<typeof deleteBreakRule>) {
    return this.breakRules.remove(data);
  }

  @MessagePattern(pattern(endBreak))
  async endBreak(
    @Payload()
    data: RpcRequest<typeof endBreak>,
  ) {
    return this.breakService.endBreak(data);
  }

  @MessagePattern(pattern(getBreakStatus))
  async getBreakStatus(
    @Payload()
    data: RpcRequest<typeof getBreakStatus>,
  ) {
    return this.breakStatus.getBreakStatus(data);
  }

  @MessagePattern(pattern(getBreaksForEntry))
  async getBreaksForEntry(
    @Payload()
    data: RpcRequest<typeof getBreaksForEntry>,
  ) {
    return this.breakRead.getBreaksForEntry(data);
  }

  @MessagePattern(pattern(getActiveBreaks))
  async getActiveBreaks(
    @Payload()
    data: RpcRequest<typeof getActiveBreaks>,
  ) {
    return this.breakRead.getActiveBreaks(data);
  }

  @MessagePattern(pattern(getBreakHistory))
  async getBreakHistory(
    @Payload()
    data: RpcRequest<typeof getBreakHistory>,
  ) {
    return this.breakRead.getBreakHistory(data);
  }

  @MessagePattern(pattern(addBreakForMember))
  async addBreakForMember(
    @Payload()
    data: RpcRequest<typeof addBreakForMember>,
  ) {
    return this.officeBreaks.addBreakForMember(data);
  }

  @MessagePattern(pattern(deleteBreak))
  async deleteBreak(@Payload() data: RpcRequest<typeof deleteBreak>) {
    return this.officeBreaks.deleteBreak(data);
  }

  @MessagePattern(pattern(endBreakManually))
  async endBreakManually(
    @Payload()
    data: RpcRequest<typeof endBreakManually>,
  ) {
    return this.breakStatus.endBreakManually(data);
  }

  @MessagePattern(pattern(getBreakSummary))
  async getBreakSummary(
    @Payload()
    data: RpcRequest<typeof getBreakSummary>,
  ) {
    return this.breakRead.getBreakSummary(data);
  }
}
