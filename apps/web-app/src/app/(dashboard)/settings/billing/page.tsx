'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { notify } from '@/lib/toast';
import { errorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { billingApi } from '@/lib/api';
import type { OrgCostBreakdown, SubscriptionView } from '@hbcfield/shared/client';

import { BillBreakdown } from './_components/bill-breakdown';
import { OptionsRail } from './_components/options-rail';

/**
 * Billing & plan.
 *
 * There is no plan any more, which is the point. This page used to show three
 * columns — Starter, Professional, Business — and ask somebody to guess which
 * bundle covered the four things they needed, upgrading every seat to reach one
 * of them. Now the bill is the sum of what the organization actually switched
 * on, and this page's job is to say so and let an admin change it.
 *
 * The two halves answer the two questions people arrive with, and they sit
 * side by side rather than stacked:
 *   "why is my bill this?"  → the breakdown, itemised down to each space
 *   "how do I get X?"       → the options rail, each with its own price
 *
 * Side by side because the two are priced differently — an option is bought
 * once for the organization, a module by each space that switches it on — and
 * one column made them look like the same kind of purchase.
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
      notify.success(t('toast.addOnsUpdated', 'Options updated.'));
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
      {/*
        Wider than the 3xl it was. The page carries a second column now, and at
        3xl the rail and the workspace list were each too narrow to read — the
        module chips wrapped one per line and the option names truncated.
      */}
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t('billing.title', 'Billing')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              'billing.subtitle',
              'You pay for the people who use HBCField, what each workspace switches on, and any options.',
            )}
          </p>
        </div>

        {/*
          Content, then the options rail.

          One column below lg: a sticky sidebar on a phone is a strip of screen
          that never scrolls away, and the rail is reference rather than
          navigation.
        */}
        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-4">
            {/* ── status, on one line ─────────────────────────────────────── */}
            {sub && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>
                  {t(st.key, st.fallback)}
                </span>

                {/*
                  Only what the server actually sends. A renewal date, a card
                  and a VAT rate would all be useful here — SubscriptionView
                  carries the first and not the other two, and a billing page
                  that invents a payment method is worse than one that omits it.
                */}
                {sub.currentPeriodEnd && !sub.cancelAtPeriodEnd && (
                  <span className="text-xs text-muted-foreground">
                    {t('billing.renewsOn', 'Renews {{date}}', {
                      date: new Date(sub.currentPeriodEnd).toLocaleDateString(),
                    })}
                  </span>
                )}
                {sub.status === 'trialing' && sub.trialDaysLeft != null && (
                  <span className="text-xs font-medium text-primary">
                    {t('billing.trialDaysLeft', '{{count}} days left in your trial — nothing to pay yet', { count: sub.trialDaysLeft })}
                  </span>
                )}
                {sub.cancelAtPeriodEnd && sub.currentPeriodEnd && (
                  <span className="text-xs text-amber-500">
                    {t('billing.cancelsOn', 'Cancels on {{date}}', {
                      date: new Date(sub.currentPeriodEnd).toLocaleDateString(),
                    })}
                  </span>
                )}

                {isAdmin && sub.billingMode !== 'EXTERNAL' && sub.status !== 'canceled' && !sub.cancelAtPeriodEnd && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 text-xs text-muted-foreground"
                    disabled={busy !== null}
                    onClick={() => go(() => billingApi.cancel(), 'cancel')}
                  >
                    {t('billing.cancel', 'Cancel')}
                  </Button>
                )}
              </div>
            )}

            {/*
              A contract customer is not paying this. Saying so ABOVE the
              breakdown matters: the numbers below are real and useful — they are
              what a renewal conversation is about — but presenting them without
              this would read as a bill nobody sent.
            */}
            {/*
              INVOICE mode: a real Stripe invoice, emailed and paid by transfer.
              Distinct from EXTERNAL, which charges nothing at all — telling a
              customer "nothing is charged automatically" when an invoice is on
              its way is how a payment gets missed.
            */}
            {sub?.billingMode === 'INVOICE' && (
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-medium text-foreground">
                  {t('billing.byInvoice', 'Paid by invoice')}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('billing.byInvoiceHint', 'We email an invoice each month, due within {{days}} days. No card is charged.', {
                    days: sub.invoiceDueDays,
                  })}
                </p>
              </div>
            )}

            {sub?.billingMode === 'EXTERNAL' && (
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

            {bill && <BillBreakdown bill={bill} estimate={sub?.billingMode === 'EXTERNAL'} />}

            <p className="text-xs text-muted-foreground">
              {t(
                'billing.modulesElsewhere',
                "Modules belong to a space — switch them on in that space's Modules tab, next to the count they are priced by.",
              )}
            </p>
          </div>

          {bill && (
            <OptionsRail
              bill={bill}
              isAdmin={isAdmin}
              onSave={saveAddOns}
              onPortal={() => go(() => billingApi.portal(), 'portal')}
              portalBusy={busy === 'portal'}
              showPortal={sub?.billingMode !== 'EXTERNAL'}
              onSubscribe={() => go(() => billingApi.checkout(), 'checkout')}
              subscribeBusy={busy === 'checkout'}
              /*
                Two questions, deliberately separate — collapsing them into one
                flag is what put "Payment & invoices" on a trialing account
                with no billing account behind it.

                `hasSubscription` — is there something for the Portal to
                manage? `totalCents` is null until Stripe has a subscription,
                and the trial has nothing to do with it.

                `canSubscribe` — should we ASK for a card? Not during a trial:
                nothing is owed yet, and asking mid-trial asks a question the
                customer has not reached. An operator ends the trial when the
                conversation about paying has begun (admin.hbcfield.com → End
                trial) and the button appears then. Not for a contract
                customer either — EXTERNAL has nothing to check out and the
                server refuses it.
              */
              hasSubscription={sub?.totalCents != null}
              canSubscribe={
                sub?.billingMode !== 'EXTERNAL' && sub?.status !== 'trialing' && sub?.totalCents == null
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
