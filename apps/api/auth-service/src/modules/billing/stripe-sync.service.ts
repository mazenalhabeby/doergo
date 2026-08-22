import { Injectable, Logger } from '@nestjs/common';
import { stripeCatalog } from '@hbcfield/shared';
import { StripeService } from './stripe.service';

const ok = <T>(data: T) => ({ success: true, data });

/**
 * Does Stripe hold what the price list says it should?
 *
 * WHAT THIS REPLACED: a sync that created Stripe prices from the editable tier
 * price book. It could mint yearly office-seat prices for Starter, Professional
 * and Business — a model that stopped billing anyone — straight onto the live
 * account, from a button in a web console. Stripe prices are immutable, so
 * every accidental press left something permanent behind.
 *
 * So this reports and never writes. Three states worth knowing about:
 *
 *   missing     the code prices something Stripe cannot charge for — checkout
 *               for that line would fail
 *   mismatched  Stripe charges an amount the code does not say. The failure
 *               this whole model exists to prevent: the app quotes one number
 *               and the customer is billed another
 *   orphaned    active in Stripe, gone from the code — still sellable, still
 *               visible on the account, billing nothing
 *
 * Fixing any of them is `tools/stripe/sync-modules.mjs`, run against the key on
 * the server, where the change is reviewed as a command rather than a click.
 */
@Injectable()
export class StripeSyncService {
  private readonly logger = new Logger(StripeSyncService.name);
  constructor(private readonly stripe: StripeService) {}

  async status() {
    const catalog = stripeCatalog();
    if (!this.stripe.isConfigured) {
      return ok({ configured: false, expected: catalog.length, matched: 0, missing: [], mismatched: [], orphaned: [] });
    }

    // Every price carrying one of our lookup keys, in a couple of pages rather
    // than one round trip per catalogue entry.
    const live = new Map<string, { id: string; unit_amount: number | null; interval?: string }>();
    for await (const p of this.stripe.listActivePrices()) {
      if (p.lookup_key) {
        live.set(p.lookup_key, { id: p.id, unit_amount: p.unit_amount, interval: p.recurring?.interval });
      }
    }

    const missing: { lookupKey: string; cents: number; productName: string }[] = [];
    const mismatched: { lookupKey: string; codeCents: number; stripeCents: number; priceId: string }[] = [];
    let matched = 0;

    for (const e of catalog) {
      const found = live.get(e.lookupKey);
      if (!found) missing.push({ lookupKey: e.lookupKey, cents: e.unitAmountCents, productName: e.productName });
      else if (found.unit_amount !== e.unitAmountCents) {
        mismatched.push({ lookupKey: e.lookupKey, codeCents: e.unitAmountCents, stripeCents: found.unit_amount ?? 0, priceId: found.id });
      } else matched++;
    }

    // Matched by OUR prefix only: the Stripe account is shared with another
    // product, and its prices are none of this console's business.
    const wanted = new Set(catalog.map((e) => e.lookupKey));
    const orphaned = [...live.entries()]
      .filter(([k]) => k.startsWith('hbcfield_') && !wanted.has(k))
      .map(([lookupKey, p]) => ({ lookupKey, cents: p.unit_amount ?? 0, interval: p.interval ?? '?', priceId: p.id }));

    if (mismatched.length) {
      this.logger.error(`[PLATFORM] ${mismatched.length} Stripe price(s) disagree with the code — customers may be charged an amount the app does not quote`);
    }

    return ok({ configured: true, expected: catalog.length, matched, missing, mismatched, orphaned });
  }
}
