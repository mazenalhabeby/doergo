import { fetchWithAuth } from './client';
import type { SubscriptionView } from '@hbcfield/shared/client';

/**
 * Mobile billing — STATUS ONLY. There is deliberately no purchase/checkout API
 * here: billing is managed by the org admin on the web. Selling a subscription
 * inside the app would violate Apple/Google in-app-purchase rules.
 */
export const billingApi = {
  getStatus: async (): Promise<SubscriptionView> => fetchWithAuth<SubscriptionView>('/billing/subscription'),
};
