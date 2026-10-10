/**
 * billing — web-only routes (the browser's screens; the phone does not call them).
 * Read raw by apps/web-app/src/lib/api (`unwrap: 'raw'`), which types each answer
 * where it calls; `R` stays `unknown` here until a second app needs it.
 */
import { defineEndpoints, endpoint } from '../../core/define';

export const billingWebEndpoints = defineEndpoints('billing', {
  setAddOns: endpoint<void, unknown, unknown>({ method: 'PUT', path: () => '/billing/add-ons' }),
  checkout: endpoint<void, unknown, unknown>({ method: 'POST', path: () => '/billing/checkout' }),
  portal: endpoint<void, unknown, unknown>({ method: 'POST', path: () => '/billing/portal' }),
  cancel: endpoint<void, unknown, unknown>({ method: 'POST', path: () => '/billing/cancel' }),
});
