import { Injectable } from '@nestjs/common';
import {
  SEAT_MONTHLY_CENTS,
  AVAILABLE_MODULES,
  MODULE_MONTHLY_CENTS,
  AVAILABLE_ADD_ONS,
  MODULE_USAGE_PRICING,
  billsByUsage,
  stripeCatalog,
} from '@hbcfield/shared';

const ok = <T>(data: T) => ({ success: true, data });

/**
 * The operator's view of the price list — read from the code that bills.
 *
 * THIS USED TO BE AN EDITABLE PRICE BOOK, and that is why it was wrong. It kept
 * its own versioned copy of the prices in the database, seeded from the tier
 * constants: office seats at €29 / €59 / €99 by tier, two field seat types, and
 * a note that "modules are free within their tier". None of that has billed
 * anybody since the tiers were replaced, so the one screen the company looks at
 * to see what it charges was showing numbers no customer could pay — and its
 * publish button could push those numbers to the live Stripe account.
 *
 * A second, editable copy of the price list is precisely the drift the module
 * model exists to remove. There is one price list, it is
 * `packages/shared/src/billing/*`, and it is what the invoice, the public
 * pricing page and this screen all read. So this is read-only by construction:
 * changing a price is a code change, reviewed and deployed, not a form.
 */
@Injectable()
export class PricingService {
  /** Everything the platform charges for, in the shape the console renders. */
  getPriceList() {
    const modules = AVAILABLE_MODULES.map((m) => ({
      key: m.key as string,
      label: m.label,
      description: m.description,
      group: m.group,
      monthlyCents: MODULE_MONTHLY_CENTS[m.key as string] ?? 0,
      /** True when a count is charged on top of the switch — see `ladders`. */
      counted: billsByUsage(m.key as string),
    })).sort((a, b) => b.monthlyCents - a.monthlyCents || a.label.localeCompare(b.label));

    const addOns = AVAILABLE_ADD_ONS.map((a) => ({
      key: a.key,
      label: a.label,
      description: a.description,
      group: a.group,
      monthlyCents: a.monthlyCents,
    })).sort((a, b) => b.monthlyCents - a.monthlyCents || a.label.localeCompare(b.label));

    const ladders = Object.entries(MODULE_USAGE_PRICING).map(([moduleKey, p]) => ({
      moduleKey,
      label: AVAILABLE_MODULES.find((m) => m.key === moduleKey)?.label ?? moduleKey,
      unit: p.unit,
      included: p.included,
      bands: p.bands,
    }));

    return ok({
      seatMonthlyCents: SEAT_MONTHLY_CENTS,
      modules,
      addOns,
      ladders,
      /** How many Stripe prices this list implies — the number the sync checks. */
      catalogueSize: stripeCatalog().length,
    });
  }
}
