import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { SERVICE_NAMES } from '@hbcfield/shared';

/**
 * "The bill moved — re-price this organization."
 *
 * A member joining or leaving, a space created or archived, a module switched
 * on, and a SPACE ROLE given or taken (an external member's seat is priced from
 * the permissions their role grants: an Observer €2, a Supervisor €9.99) all
 * change what the organization owes. This was written out three times
 * (`syncSeats` on organizations and employees, `rebill` on locations), and the
 * space-roles routes — which set exactly the role that sets the price — had no
 * copy at all, so a role change reached Stripe only with the nightly sweep.
 *
 * Fire-and-forget, and debounced on the far side: a burst of changes collapses
 * into one proration, and a billing hiccup must never fail the change itself.
 */
@Injectable()
export class RebillService {
  constructor(@Inject(SERVICE_NAMES.AUTH) private readonly authClient: ClientProxy) {}

  rebill(organizationId: string | null | undefined): void {
    if (!organizationId) return;
    try {
      firstValueFrom(this.authClient.send({ cmd: 'billing_reconcile_seats' }, { organizationId })).catch(() => {});
    } catch {
      // A synchronous throw from the transport is still never the caller's failure.
    }
  }
}

@Global()
@Module({
  providers: [RebillService],
  exports: [RebillService],
})
export class RebillModule {}
