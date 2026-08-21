'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { notify } from '@/lib/toast';
import { errorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { billingApi } from '@/lib/api';
import type { OrgCostBreakdown, SubscriptionView } from '@hbcfield/shared/client';

import { BillBreakdown } from './_components/bill-breakdown';
import { AddOnPicker } from './_components/add-on-picker';

/**
 * Billing & plan.
 *
 * There is no plan any more, which is the point. This page used to show three
 * columns — Starter, Professional, Business — and ask somebody to guess which
 * bundle covered the four things they needed, upgrading every seat to reach one
 * of them. Now the bill is the sum of what the organization actually switched
 * on, and this page's job is to say so and let an admin change it.
 *
 * The two halves answer the two questions people arrive with:
 *   "why is my bill this?"  → the breakdown, itemised down to each space
 *   "how do I get X?"       → the add-on list, each with its own price
 *
 * Modules are deliberately NOT bought here. A module belongs to a space and is
 * switched on in that space's Modules tab, next to the count it is priced by —
 * buying it from a billing screen would separate the decision from the thing it
 * affects.
 */

const STATUS_BADGE: Record<string, { key: string; fallback: string; cls: string }> = {
  trialing: { key: 'billing.status.trialing', fallback: 'Trial', cls: 'bg-primary/10 text-primary' },
  active: { key: 'billing.status.active', fallback: 'Active', cls: 'bg-emerald-500/10 text-emerald-500' },
  past_due: { key: 'billing.status.pastDue', fallback: 'Payment due', cls: 'bg-amber-500/10 text-amber-500' },
  canceled: { key: 'billing.status.canceled', fallback: 'Canceled', cls: 'bg-muted text-muted-foreground' },
  incomplete: { key: 'billing.status.incomplete', fallback: 'Inactive', cls: 'bg-red-500/10 text-red-500' },
};

export default function BillingPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [sub, setSub] = useState<SubscriptionView | null>(null);
  const [bill, setBill] = useState<OrgCostBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Both together: the status comes from Stripe's view of the subscription,
    // the bill from what the organization has. Neither is derivable from the
    // other, and a page showing one without the other is half an answer.
    const [s, b] = await Promise.all([billingApi.getSubscription(), billingApi.getBill()]);
    setSub(s);
    setBill(b);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => notify.error(errorMessage(e, t('toast.billingLoadFailed', "Couldn't load billing details."))))
      .finally(() => setLoading(false));
  }, [load, t]);

  const go = async (fn: () => Promise<{ url?: string } | void>, key: string) => {
    setBusy(key);
    try {
      const res = await fn();
      if (res && 'url' in res && res.url) {
        window.location.href = res.url;
        return;
      }
      await load();
      notify.success(t('toast.billingUpdated', 'Billing updated.'));
    } catch (e) {
      notify.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const saveAddOns = async (keys: string[]) => {
    try {
      await billingApi.setAddOns(keys);
      // Re-read rather than patching local state: the bill moves with the
      // add-ons, and a total the page computed itself is exactly the drift this
      // model exists to remove.
      await load();
      notify.success(t('toast.addOnsUpdated', 'Add-ons updated.'));
    } catch (e) {
      notify.error(errorMessage(e));
      throw e;
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const st = sub ? STATUS_BADGE[sub.status] ?? STATUS_BADGE.active : STATUS_BADGE.active;

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t('billing.title', 'Billing')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              'billing.subtitle',
              'You pay for the people who use HBCField, what each space switches on, and any add-ons.',
            )}
          </p>
        </div>

        {/* ── subscription status ───────────────────────────────────────────── */}
        {sub && (
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>
                  {t(st.key, st.fallback)}
                </span>
                {sub.status === 'trialing' && sub.trialDaysLeft != null && (
                  <p className="mt-2 text-sm font-medium text-primary">
                    {t('billing.trialDaysLeft', '{{count}} days left in your trial', { count: sub.trialDaysLeft })}
                  </p>
                )}
                {sub.cancelAtPeriodEnd && sub.currentPeriodEnd && (
                  <p className="mt-2 text-sm text-amber-500">
                    {t('billing.cancelsOn', 'Cancels on {{date}}', {
                      date: new Date(sub.currentPeriodEnd).toLocaleDateString(),
                    })}
                  </p>
                )}
              </div>

              {isAdmin && !sub.billedExternally && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => go(() => billingApi.portal(), 'portal')}
                  >
                    {busy === 'portal' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ExternalLink className="mr-2 h-4 w-4" />
                    )}
                    {t('billing.paymentAndInvoices', 'Payment & invoices')}
                  </Button>
                  {sub.status !== 'canceled' && !sub.cancelAtPeriodEnd && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => go(() => billingApi.cancel(), 'cancel')}
                    >
                      {t('billing.cancel', 'Cancel')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/*
          A contract customer is not paying this. Saying so ABOVE the breakdown
          matters: the numbers below are real and useful — they are what a
          renewal conversation is about — but presenting them without this would
          read as a bill nobody sent.
        */}
        {sub?.billedExternally && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm font-medium text-foreground">
              {t('billing.byAgreement', 'Billed by agreement')}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                'billing.byAgreementHint',
                'Nothing is charged automatically. The figures below are what this organization would cost at list price — useful for a renewal, not an invoice.',
              )}
            </p>
          </div>
        )}

        {!isAdmin && (
          <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            {t('billing.adminOnly', 'Only an organization admin can change what you pay for.')}
          </div>
        )}

        {bill && <BillBreakdown bill={bill} estimate={sub?.billedExternally} />}

        {bill && (
          <AddOnPicker
            purchased={bill.addOns.map((a) => a.key)}
            disabled={!isAdmin}
            onSave={saveAddOns}
          />
        )}

        <p className="text-xs text-muted-foreground">
          {t(
            'billing.modulesElsewhere',
            "Modules belong to a space — switch them on in that space's Modules tab, next to the count they are priced by.",
          )}
        </p>
      </div>
    </div>
  );
}
