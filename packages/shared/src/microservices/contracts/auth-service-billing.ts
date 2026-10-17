/** Message contracts for auth-service `billing` handlers (types only — the wire is the cmd string). */
import { rpc } from '../contract';

export const billingGetSubscription = rpc<{ organizationId: string }>('billing_get_subscription');
export const billingGetBill = rpc<{ organizationId: string }>('billing_get_bill');
export const billingSetAddons = rpc<{ organizationId: string; addOns: string[] }>('billing_set_addons');
export const billingAdminListOrgs = rpc<Record<string, never>>('billing_admin_list_orgs');
export const billingAdminSetAddons = rpc<{ organizationId: string; addOns: string[]; byUserId?: string }>(
  'billing_admin_set_addons',
);
export const billingCreateCheckout = rpc<{ organizationId: string; successUrl: string; cancelUrl: string }>(
  'billing_create_checkout',
);
export const billingCreatePortal = rpc<{ organizationId: string; returnUrl: string }>('billing_create_portal');
export const billingCancel = rpc<{ organizationId: string }>('billing_cancel');
export const billingReconcileSeats = rpc<{ organizationId: string }>('billing_reconcile_seats');
export const billingWebhook = rpc<{ rawBody: string; signature: string }>('billing_webhook');
export const platformPricingStripeStatus = rpc<Record<string, never>>('platform_pricing_stripe_status');
