import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { BillingService } from './billing.service';
import { SubscriptionService } from './subscription.service';
import { StripeWebhookService } from './stripe-webhook.service';
import { BillingAdminService } from './billing-admin.service';

import {
  pattern,
  billingGetSubscription,
  billingGetBill,
  billingSetAddons,
  billingAdminListOrgs,
  billingAdminSetAddons,
  billingCreateCheckout,
  billingCreatePortal,
  billingCancel,
  billingReconcileSeats,
  billingWebhook,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
@Controller()
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly billingAdmin: BillingAdminService,
    private readonly webhooks: StripeWebhookService,
    private readonly subscriptions: SubscriptionService,
  ) {}

  @MessagePattern(pattern(billingGetSubscription))
  getSubscription(@Payload() d: RpcRequest<typeof billingGetSubscription>) {
    return this.subscriptions.getSubscription(d.organizationId);
  }

  @MessagePattern(pattern(billingGetBill))
  getBill(@Payload() d: RpcRequest<typeof billingGetBill>) {
    return this.billing.getBill(d.organizationId);
  }

  @MessagePattern(pattern(billingSetAddons))
  setAddOns(@Payload() d: RpcRequest<typeof billingSetAddons>) {
    return this.billing.setAddOns(d.organizationId, d.addOns);
  }

  @MessagePattern(pattern(billingAdminListOrgs))
  adminListOrgs() {
    return this.billingAdmin.adminListOrgs();
  }

  @MessagePattern(pattern(billingAdminSetAddons))
  adminSetOrgAddOns(@Payload() d: RpcRequest<typeof billingAdminSetAddons>) {
    return this.billingAdmin.adminSetOrgAddOns(d);
  }

  @MessagePattern(pattern(billingCreateCheckout))
  createCheckout(@Payload() d: RpcRequest<typeof billingCreateCheckout>) {
    return this.subscriptions.createCheckout(d.organizationId, d.successUrl, d.cancelUrl);
  }

  @MessagePattern(pattern(billingCreatePortal))
  createPortal(@Payload() d: RpcRequest<typeof billingCreatePortal>) {
    return this.subscriptions.createPortal(d.organizationId, d.returnUrl);
  }

  @MessagePattern(pattern(billingCancel))
  cancel(@Payload() d: RpcRequest<typeof billingCancel>) {
    return this.subscriptions.cancel(d.organizationId);
  }

  @MessagePattern(pattern(billingReconcileSeats))
  reconcile(@Payload() d: RpcRequest<typeof billingReconcileSeats>) {
    // Debounced: a burst of member changes collapses into one Stripe sync.
    return this.billing.scheduleReconcile(d.organizationId);
  }

  @MessagePattern(pattern(billingWebhook))
  webhook(@Payload() d: RpcRequest<typeof billingWebhook>) {
    return this.webhooks.applyWebhook(d.rawBody, d.signature);
  }
}
