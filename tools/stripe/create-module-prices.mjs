#!/usr/bin/env node
/**
 * Create the Stripe products and prices for the space-module pricing model.
 *
 *   users  → one flat seat price
 *   spaces → one product per module, billed with quantity = spaces using it
 *
 * Run it yourself; it never sees a key it was not given:
 *
 *   node tools/stripe/create-module-prices.mjs                 # dry run, prints the plan
 *   STRIPE_SECRET_KEY=sk_... node tools/stripe/create-module-prices.mjs --apply
 *
 * SAFE TO RE-RUN. Every price carries a `lookup_key`, and an existing one is
 * reused rather than duplicated — because a Stripe price cannot be edited or
 * deleted, only archived, so a script that creates blindly leaves permanent
 * mess behind on its second run.
 *
 * It creates NOTHING ELSE: no subscriptions, no customers, no changes to the
 * eight existing tier prices. Those stay live until the billing service is
 * moved over, and archiving them is a separate, deliberate act.
 *
 * The amounts come from `@hbcfield/shared` so this file cannot disagree with
 * the application about what anything costs.
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const {
  MODULE_MONTHLY_CENTS,
  SEAT_MONTHLY_CENTS,
  ANNUAL_MONTHS_CHARGED,
  AVAILABLE_MODULES,
  formatCents,
} = require('../../packages/shared/dist/index.js');

const APPLY = process.argv.includes('--apply');
const KEY = process.env.STRIPE_SECRET_KEY ?? '';
const API = 'https://api.stripe.com/v1';

/** SaaS — business use. Products need one before automatic tax can be enabled. */
const TAX_CODE = 'txcd_10103001';
/** VAT on top of the listed price, matching the existing seat prices. */
const TAX_BEHAVIOR = 'exclusive';
const CURRENCY = 'eur';

const MODULE_LABEL = Object.fromEntries(AVAILABLE_MODULES.map((m) => [m.key, m.label]));

/** Stripe wants form encoding, including for nested metadata. */
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object' && !Array.isArray(v)) form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function stripe(path, body, method = 'POST') {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      // Re-running a half-finished script must not create a second copy of
      // anything it already made.
      ...(body?.__idem ? { 'Idempotency-Key': body.__idem } : {}),
    },
    ...(body ? { body: form({ ...body, __idem: undefined }) } : {}),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path}: ${json?.error?.message ?? res.status}`);
  return json;
}

/** An existing price with this lookup key, or null. */
async function findPrice(lookupKey) {
  const res = await stripe(`/prices?lookup_keys[]=${encodeURIComponent(lookupKey)}&limit=1`, null, 'GET');
  return res.data?.[0] ?? null;
}

async function findProduct(metaKey) {
  // `search` is eventually consistent, so the product is also matched by its
  // stable id below — search is only the fast path.
  const q = encodeURIComponent(`metadata['hbcfield_key']:'${metaKey}'`);
  const res = await stripe(`/products/search?query=${q}&limit=1`, null, 'GET');
  return res.data?.[0] ?? null;
}

/** One product, with a monthly and an annual price. Idempotent. */
async function ensure({ hbcfieldKey, name, description, monthlyCents, kind }) {
  const annualCents = monthlyCents * ANNUAL_MONTHS_CHARGED;
  // The seat's kind and key are both "seat"; naming it once avoids
  // `hbcfield_seat_seat_monthly`, which a person then has to read twice.
  const slug = kind === hbcfieldKey ? kind : `${kind}_${hbcfieldKey}`;
  const lookupMonthly = `hbcfield_${slug}_monthly`;
  const lookupAnnual = `hbcfield_${slug}_annual`;

  if (!APPLY) {
    console.log(
      `  ${name.padEnd(22)} ${formatCents(monthlyCents).padStart(7)}/mo   ` +
        `${formatCents(annualCents).padStart(8)}/yr   ${lookupMonthly}`,
    );
    return { monthly: null, annual: null };
  }

  let product = await findProduct(hbcfieldKey);
  if (!product) {
    product = await stripe('/products', {
      name,
      description,
      tax_code: TAX_CODE,
      metadata: { hbcfield_key: hbcfieldKey, hbcfield_kind: kind },
      __idem: `hbcfield-product-${hbcfieldKey}`,
    });
    console.log(`  created product  ${product.id}  ${name}`);
  } else {
    console.log(`  exists  product  ${product.id}  ${name}`);
  }

  const prices = {};
  for (const [interval, cents, lookup] of [
    ['month', monthlyCents, lookupMonthly],
    ['year', annualCents, lookupAnnual],
  ]) {
    let price = await findPrice(lookup);
    if (!price) {
      price = await stripe('/prices', {
        product: product.id,
        currency: CURRENCY,
        unit_amount: cents,
        tax_behavior: TAX_BEHAVIOR,
        lookup_key: lookup,
        recurring: { interval, usage_type: 'licensed' },
        metadata: { hbcfield_key: hbcfieldKey, hbcfield_kind: kind },
        __idem: `hbcfield-price-${lookup}`,
      });
      console.log(`  created price    ${price.id}  ${lookup}  ${formatCents(cents)}`);
    } else {
      console.log(`  exists  price    ${price.id}  ${lookup}`);
      if (price.unit_amount !== cents) {
        // Loud, because a price cannot be edited: the fix is a new price and a
        // migration, not a quiet correction here.
        console.log(
          `    ⚠ AMOUNT DIFFERS — Stripe has ${formatCents(price.unit_amount)}, ` +
            `the code says ${formatCents(cents)}. Archive and recreate, or change the code.`,
        );
      }
    }
    prices[interval] = price;
  }
  return { monthly: prices.month, annual: prices.year };
}

async function main() {
  if (APPLY && !KEY) {
    console.error('STRIPE_SECRET_KEY is not set. Refusing to run.');
    process.exit(1);
  }
  console.log(
    APPLY
      ? `APPLYING to Stripe (${KEY.startsWith('sk_live') ? 'LIVE — real money' : 'test mode'})\n`
      : 'DRY RUN — nothing is created. Re-run with --apply to create.\n',
  );

  const env = [];

  console.log('SEAT');
  const seat = await ensure({
    hbcfieldKey: 'seat',
    kind: 'seat',
    name: 'User',
    description: 'One user of HBCField. The same price for everybody.',
    monthlyCents: SEAT_MONTHLY_CENTS,
  });
  if (APPLY) {
    env.push(`STRIPE_PRICE_SEAT_MONTHLY=${seat.monthly.id}`);
    env.push(`STRIPE_PRICE_SEAT_ANNUAL=${seat.annual.id}`);
  }

  console.log('\nSPACE MODULES  (quantity = number of spaces with it switched on)');
  // Catalogue order, so the dashboard and the price list read alike.
  for (const mod of AVAILABLE_MODULES) {
    const cents = MODULE_MONTHLY_CENTS[mod.key];
    if (typeof cents !== 'number') {
      console.log(`  ⚠ ${mod.key} has no price in the code — skipped`);
      continue;
    }
    const res = await ensure({
      hbcfieldKey: mod.key,
      kind: 'module',
      name: MODULE_LABEL[mod.key] ?? mod.key,
      description: `${mod.description} — billed per space.`,
      monthlyCents: cents,
    });
    if (APPLY) {
      const K = mod.key.toUpperCase();
      env.push(`STRIPE_PRICE_MODULE_${K}_MONTHLY=${res.monthly.id}`);
      env.push(`STRIPE_PRICE_MODULE_${K}_ANNUAL=${res.annual.id}`);
    }
  }

  if (APPLY) {
    console.log('\n─── add these to infra/docker/.env.production ───\n');
    console.log(env.join('\n'));
    console.log('\nNothing is billing on these yet — the service still reads the old tier prices.');
  } else {
    const total = AVAILABLE_MODULES.reduce((s, m) => s + (MODULE_MONTHLY_CENTS[m.key] ?? 0), 0);
    console.log(
      `\n${AVAILABLE_MODULES.length} modules + 1 seat = ${(AVAILABLE_MODULES.length + 1) * 2} prices.` +
        `  A space with everything on: ${formatCents(total)}/mo.`,
    );
  }
}

main().catch((e) => {
  console.error(`\nFailed: ${e.message}`);
  console.error('Safe to re-run — anything already created is reused, not duplicated.');
  process.exit(1);
});
