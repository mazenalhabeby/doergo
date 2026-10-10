import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import { billingEndpoints, billingWebEndpoints, type OrgCostBreakdown, type SubscriptionView } from '@hbcfield/shared/client';

export const billingApi = {
  /** The itemised bill: seats, every space's modules and ladders, org add-ons. */
  getBill: async (): Promise<OrgCostBreakdown> => {
    const response = await call(billingEndpoints.bill) as ApiResponse<OrgCostBreakdown>;
    if (response.error) throw apiError(response);
    return response.data as OrgCostBreakdown;
  },

  /**
   * Replace the organization's add-ons. The WHOLE list — sending a subset
   * removes the rest, which is what the screen means by "these are the ones
   * I want".
   */
  setAddOns: async (addOns: string[]): Promise<string[]> => {
    const response = await call(billingWebEndpoints.setAddOns, undefined, { body: { addOns } }) as ApiResponse<string[]>;
    if (response.error) throw apiError(response);
    return response.data as string[];
  },

  /** Current org subscription/billing status. */
  getSubscription: async (): Promise<SubscriptionView> => {
    const response = await call(billingEndpoints.subscription) as ApiResponse<SubscriptionView>;
    if (response.error) throw apiError(response);
    return response.data as SubscriptionView;
  },

  /** Start Stripe Checkout for whatever the org already has → redirect URL. */
  checkout: async (): Promise<{ url: string }> => {
    const response = await call(billingWebEndpoints.checkout, undefined, { body: {} }) as ApiResponse<{ url: string }>;
    if (response.error) throw apiError(response);
    return response.data as { url: string };
  },

  /** Open the Stripe Customer Portal (payment method, invoices, cancel). */
  portal: async (): Promise<{ url: string }> => {
    const response = await call(billingWebEndpoints.portal, undefined, { body: {} }) as ApiResponse<{ url: string }>;
    if (response.error) throw apiError(response);
    return response.data as { url: string };
  },

  // No `changePlan`: it only ever switched monthly ↔ annual, and billing is
  // monthly. Everything else about the bill changes by switching a module on or
  // off where it lives, which reconciles on its own.

  /** Cancel at period end. */
  cancel: async (): Promise<void> => {
    const response = await call(billingWebEndpoints.cancel, undefined, { body: {} }) as ApiResponse<unknown>;
    if (response.error) throw apiError(response);
  },
};
