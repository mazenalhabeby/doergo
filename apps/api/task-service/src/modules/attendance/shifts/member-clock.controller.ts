import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { eventPattern, type EventPayload, memberClockSwitchedEvent } from '@hbcfield/shared/microservices';
import { ShiftInstancesService } from './shift-instances.service';

/**
 * An administrator switched their own clock off (clock review A7; the switch lives on the member, auth-service).
 * The rota's expected shifts are this service's: the ones still ahead are not expected any more, so nobody is
 * chased as a no-show for a clock they do not use. The past is kept. On again → the next materialize run
 * expects them as before.
 */
@Controller()
export class MemberClockController {
  private readonly logger = new Logger(MemberClockController.name);

  constructor(private readonly instances: ShiftInstancesService) {}

  @EventPattern(eventPattern(memberClockSwitchedEvent))
  async onClockSwitched(@Payload() data: EventPayload<typeof memberClockSwitchedEvent>) {
    if (!data?.userId || !data.clockOff) return;
    const dropped = await this.instances.dropUpcomingFor(data.userId, data.organizationId);
    this.logger.log(`clock off for user=${data.userId}: ${dropped} upcoming shift(s) no longer expected`);
  }
}
