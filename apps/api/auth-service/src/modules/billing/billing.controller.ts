import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { BillingService } from './billing.service';
import { SubscriptionService } from './subscription.service';
import { StripeWebhookService } from './stripe-webhook.service';
import { BillingAdminService } from './billing-admin.service';

@Controller()
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly billingAdmin: BillingAdminService,
    private readonly webhooks: StripeWebhookService,
    private readonly subscriptions: SubscriptionService,
  ) {}

  @MessagePattern({ cmd: 'billing_get_subscription' })
  getSubscription(@Payload() d: { organizationId: string }) {
    return this.subscriptions.getSubscription(d.organizationId);
  }

  @MessagePattern({ cmd: 'billing_get_bill' })
  getBill(@Payload() d: { organizationId: string }) {
    return this.billing.getBill(d.organizationId);
  }

  @MessagePattern({ cmd: 'billing_set_addons' })
  setAddOns(@Payload() d: { organizationId: string; addOns: string[] }) {
    return this.billing.setAddOns(d.organizationId, d.addOns);
  }

  @MessagePattern({ cmd: 'billing_admin_list_orgs' })
  adminListOrgs() {
    return this.billingAdmin.adminListOrgs();
  }

  @MessagePattern({ cmd: 'billing_admin_set_addons' })
  adminSetOrgAddOns(@Payload() d: { organizationId: string; addOns: string[]; byUserId?: string }) {
    return this.billingAdmin.adminSetOrgAddOns(d);
  }

  @MessagePattern({ cmd: 'billing_create_checkout' })
  createCheckout(@Payload() d: { organizationId: string; successUrl: string; cancelUrl: string }) {
    return this.subscriptions.createCheckout(d.organizationId, d.successUrl, d.cancelUrl);
  }

  @MessagePattern({ cmd: 'billing_create_portal' })
  createPortal(@Payload() d: { organizationId: string; returnUrl: string }) {
    return this.subscriptions.createPortal(d.organizationId, d.returnUrl);
  }

  @MessagePattern({ cmd: 'billing_cancel' })
  cancel(@Payload() d: { organizationId: string }) {
    return this.subscriptions.cancel(d.organizationId);
  }

  @MessagePattern({ cmd: 'billing_reconcile_seats' })
  reconcile(@Payload() d: { organizationId: string }) {
    // Debounced: a burst of member changes collapses into one Stripe sync.
    return this.billing.scheduleReconcile(d.organizationId);
  }

  @MessagePattern({ cmd: 'billing_webhook' })
  webhook(@Payload() d: { rawBody: string; signature: string }) {
    return this.webhooks.applyWebhook(d.rawBody, d.signature);
  }
}
