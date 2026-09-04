'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, CreditCard, ExternalLink, Loader2, Puzzle } from 'lucide-react';
import { addOnDef, addOnI18n, formatCents, type OrgCostBreakdown } from '@hbcfield/shared/client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AddOnPicker } from './add-on-picker';

/**
 * Options, kept beside the bill rather than below it.
 *
 * An option is bought ONCE for the whole organization. Everything on the other
 * side of this page — modules, usage, seats — is bought per workspace or per
 * person. Scrolling past each other in one column, the two read as the same kind
 * of purchase, which is the misunderstanding behind "why am I paying for audit
 * log four times?" (you are not, and never were).
 *
 * Sticky, so the list stays in view while the workspaces scroll: the comparison
 * between "bought once" and "bought per workspace" is the point, and a
 * comparison only works while both halves are visible.
 *
 * The rail LISTS; it does not edit. The picker needs room for switches,
 * descriptions and four groups, and squeezing that into a 320px column would
 * make a worse version of a component that already works. It opens in a dialog,
 * mounted only when opened — twelve switches and their strings are not built on
 * every visit to this page.
 */
export function OptionsRail({
  bill,
  isAdmin,
  onSave,
  onPortal,
  portalBusy,
  showPortal,
  onSubscribe,
  subscribeBusy,
  /**
   * No Stripe subscription yet — so there is nothing for the Customer Portal to
   * manage, and the button that opens it can only say "No billing account yet".
   *
   * The action that FIXES that had no button at all: `POST /billing/checkout`
   * existed on the server, `billingApi.checkout()` existed in the client, and
   * nothing in the product ever called either. An organization on a card plan
   * could not start paying, which is why no real payment had ever completed.
   */
  needsSubscription,
}: {
  bill: OrgCostBreakdown;
  isAdmin: boolean;
  onSave: (keys: string[]) => Promise<void>;
  onPortal: () => void;
  portalBusy: boolean;
  /** Hidden for a contract customer — there is no Stripe portal to open. */
  showPortal: boolean;
  onSubscribe: () => void;
  subscribeBusy: boolean;
  needsSubscription: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const label = (key: string) => {
    const def = addOnDef(key);
    return t(addOnI18n.label(key), { defaultValue: def?.label ?? key });
  };

  // Dearest first: the list answers "what is this €297?", and the answer starts
  // with the line that is most of it.
  const options = [...bill.addOns].sort((a, b) => b.monthlyCents - a.monthlyCents);

  return (
    <aside className="lg:sticky lg:top-4">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border bg-gradient-to-b from-pink-500/[0.07] to-transparent px-4 py-3.5">
          {/*
            The scope is part of the heading, not a footnote under it.

            This is the section people misread — "am I paying for audit log in
            every workspace?" — and the answer belongs where the eye lands, in
            the same pill the other two sections carry.
          */}
          <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-pink-600 dark:text-pink-400">
            <Puzzle className="h-3.5 w-3.5" />
            {t('billing.addOns.title', 'Options')}
            <span className="rounded border border-pink-500/30 px-1.5 py-0.5 text-[10px] font-medium tracking-wide">
              {t('billing.scope.wholeOrg', 'Whole organization')}
            </span>
          </p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
            {formatCents(bill.addOnsMonthlyCents)}
          </p>
          <p className="text-xs text-muted-foreground">
            {options.length > 0
              ? t('billing.addOns.railCount', '{{count}} chosen · charged once, not per workspace', {
                  count: options.length,
                })
              : t('billing.addOns.railNone', 'None chosen yet')}
          </p>
        </div>

        {options.length > 0 && (
          // Capped and scrollable: twelve rows fit, but the list grows with the
          // catalogue and an unbounded rail would push its own buttons off the
          // bottom of a sticky column — the same failure the picker's footer fixed.
          <ul className="max-h-[19rem] divide-y divide-border overflow-y-auto">
            {options.map((a) => (
              <li key={a.key} className="flex items-center justify-between gap-2.5 px-4 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="grid h-4 w-4 shrink-0 place-items-center rounded bg-pink-500/10 text-pink-600 dark:text-pink-400"
                  >
                    <Check className="h-2.5 w-2.5" />
                  </span>
                  <span className="truncate text-[13px] text-foreground">{label(a.key)}</span>
                </span>
                <span className="shrink-0 text-[13px] font-semibold tabular-nums text-muted-foreground">
                  {formatCents(a.monthlyCents)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2 border-t border-border p-3">
          {/*
            Start paying — the first thing an organization on a card plan needs
            and the one action the page never offered. Shown only while there is
            no subscription; once there is one, the Portal below manages it.
          */}
          {needsSubscription && (
            <Button className="w-full" size="sm" disabled={!isAdmin || subscribeBusy} onClick={onSubscribe}>
              {subscribeBusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="mr-2 h-4 w-4" />
              )}
              {t('billing.subscribe', 'Set up payment')}
            </Button>
          )}
          <Button
            className="w-full"
            size="sm"
            variant={needsSubscription ? 'outline' : 'default'}
            disabled={!isAdmin}
            onClick={() => setOpen(true)}
          >
            {t('billing.addOns.change', 'Change options')}
          </Button>
          {showPortal && !needsSubscription && (
            <Button variant="outline" className="w-full" size="sm" disabled={!isAdmin || portalBusy} onClick={onPortal}>
              {portalBusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              {t('billing.paymentAndInvoices', 'Payment & invoices')}
            </Button>
          )}
        </div>
      </div>

      <p className="mt-3 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        <b className="mb-0.5 block font-semibold text-foreground">
          {t('billing.addOns.railNoteTitle', 'Chosen once, used everywhere')}
        </b>
        {t(
          'billing.addOns.railNote',
          'An option is priced for the whole organization — unlike a module, which is priced for each workspace that switches it on.',
        )}
      </p>

      {/* Mounted only while open: the picker builds twelve switches and their
          translated descriptions, and this page is read far more than edited. */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[86vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('billing.addOns.title', 'Options')}</DialogTitle>
          </DialogHeader>
          <AddOnPicker
            purchased={bill.addOns.map((a) => a.key)}
            disabled={!isAdmin}
            onSave={async (keys) => {
              await onSave(keys);
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </aside>
  );
}
