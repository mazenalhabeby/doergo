"use client";

/** BillingPage's module-level helpers, moved here unchanged so its sections can read them too. */
export const STATUS_BADGE: Record<string, { key: string; fallback: string; cls: string }> = {
  trialing: { key: 'billing.status.trialing', fallback: 'Trial', cls: 'bg-primary/10 text-primary' },
  active: { key: 'billing.status.active', fallback: 'Active', cls: 'bg-emerald-500/10 text-emerald-500' },
  past_due: { key: 'billing.status.pastDue', fallback: 'Payment due', cls: 'bg-amber-500/10 text-amber-500' },
  canceled: { key: 'billing.status.canceled', fallback: 'Canceled', cls: 'bg-muted text-muted-foreground' },
  incomplete: { key: 'billing.status.incomplete', fallback: 'Inactive', cls: 'bg-red-500/10 text-red-500' },
};
