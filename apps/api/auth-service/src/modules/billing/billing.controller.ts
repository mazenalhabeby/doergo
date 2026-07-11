import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { BillingService } from './billing.service';
import type { CheckoutRequest, ChangePlanRequest } from '@hbcfield/shared';

@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @MessagePattern({ cmd: 'billing_get_subscription' })
  getSubscription(@Payload() d: { organizationId: string }) {
    return this.billing.getSubscription(d.organizationId);
  }

  @MessagePattern({ cmd: 'billing_start_trial' })
  startTrial(@Payload() d: { organizationId: string }) {
    return this.billing.startTrial(d.organizationId);
  }

  @MessagePattern({ cmd: 'billing_create_checkout' })
  createCheckout(@Payload() d: { organizationId: string; req: CheckoutRequest; successUrl: string; cancelUrl: string }) {
    return this.billing.createCheckout(d.organizationId, d.req, d.successUrl, d.cancelUrl);
  }

  @MessagePattern({ cmd: 'billing_create_portal' })
  createPortal(@Payload() d: { organizationId: string; returnUrl: string }) {
    return this.billing.createPortal(d.organizationId, d.returnUrl);
  }

  @MessagePattern({ cmd: 'billing_change_plan' })
  changePlan(@Payload() d: { organizationId: string; req: ChangePlanRequest; successUrl: string; cancelUrl: string }) {
    return this.billing.changePlan(d.organizationId, d.req, d.successUrl, d.cancelUrl);
  }

  @MessagePattern({ cmd: 'billing_cancel' })
  cancel(@Payload() d: { organizationId: string }) {
    return this.billing.cancel(d.organizationId);
  }

  @MessagePattern({ cmd: 'billing_reconcile_seats' })
  reconcile(@Payload() d: { organizationId: string }) {
    // Debounced: a burst of member changes collapses into one Stripe sync.
    return this.billing.scheduleReconcile(d.organizationId);
  }

  @MessagePattern({ cmd: 'billing_webhook' })
  webhook(@Payload() d: { rawBody: string; signature: string }) {
    return this.billing.applyWebhook(d.rawBody, d.signature);
  }
}
