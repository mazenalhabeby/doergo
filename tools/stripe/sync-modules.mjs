#!/usr/bin/env node
/**
 * Make Stripe match the price list — reporting first, changing only if asked.
 *
 *   node tools/stripe/sync-modules.mjs                    # dry run, changes nothing
 *   node tools/stripe/sync-modules.mjs --apply            # create what is missing
 *   node tools/stripe/sync-modules.mjs --archive-orphans  # + retire what the code dropped
 *
 * WHAT IT DOES NOT DO, deliberately:
 *
 *   • It never edits or deletes an existing price. Stripe prices are immutable
 *     by design and customers are subscribed to them; "fixing" one means making
 *     a new price and migrating subscriptions, which is a decision, not a sync.
 *   • It never archives anything unless you ask for it by name, and never a
 *     price that any subscription still points at — it checks Stripe for one
 *     first and refuses rather than cutting somebody's billing line out from
 *     under them. Archiving is reversible; that is why it is allowed at all.
 *
 * The orphan pass exists because removing something from the price list leaves
 * its Stripe price behind, still active and still sellable. That happened when
 * annual billing was dropped: 31 yearly prices stayed on the account, priced by
 * a model the app no longer has. Reporting them is always on; retiring them is
 * opt-in.
 *
 * So the writes it performs are CREATE for a lookup key that does not exist
 * yet, and — only when asked — ARCHIVE for one the code no longer knows.
 * Everything else it reports and leaves alone. A price whose
 * amount disagrees with the code is called out as a MISMATCH — loudly, because
 * that is the state where the app quotes one number and the customer is charged
 * another, and it is the failure this whole model exists to prevent.
 *
 * The key never touches this machine: run it on the server, where
 * STRIPE_SECRET_KEY already lives in the environment.
 *
 *   ssh root@<host> 'cd /opt/doergo && \
 *     STRIPE_SECRET_KEY=$(grep ^STRIPE_SECRET_KEY= infra/docker/.env.production | cut -d= -f2-) \
 *     node tools/stripe/sync-modules.mjs'
 */

import Stripe from 'stripe';
import { readFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const ARCHIVE = process.argv.includes('--archive-orphans');
const KEY = process.env.STRIPE_SECRET_KEY;

/*
  The catalogue comes from the shared package, or from a JSON file it was dumped
  to. The file form exists because the key lives on the server and the server
  runs compiled containers that bundle shared rather than shipping its dist —
  so the honest choice is to carry the catalogue to the key, not the key to the
  catalogue. Dump it with:

    node -e "import('./packages/shared/dist/index.js').then(m => \
      console.log(JSON.stringify(m.stripeCatalog())))" > catalog.json
*/
const catalogArg = process.argv.indexOf('--catalog');
async function loadCatalog() {
  if (catalogArg !== -1) return JSON.parse(readFileSync(process.argv[catalogArg + 1], 'utf8'));
  const m = await import('../../packages/shared/dist/index.js');
  return m.stripeCatalog();
}

if (!KEY) {
  console.error('STRIPE_SECRET_KEY is not set. Run this where the key already lives.');
  process.exit(1);
}

const LIVE = KEY.startsWith('sk_live');
const stripe = new Stripe(KEY, { apiVersion: '2024-06-20' });

const eur = (cents) => `€${(cents / 100).toFixed(2)}`;
const pad = (s, n) => String(s).padEnd(n);

async function main() {
  const catalog = await loadCatalog();

  console.log('');
  console.log(`  HBCField price sync — ${LIVE ? 'LIVE ACCOUNT' : 'test mode'}`);
  console.log(`  ${APPLY || ARCHIVE ? 'APPLY' : 'DRY RUN'} — ${[APPLY && 'create missing', ARCHIVE && 'archive orphans'].filter(Boolean).join(', ') || 'nothing will be changed'}`);
  console.log(`  ${catalog.length} prices expected across ${new Set(catalog.map((e) => e.productName)).size} products`);
  console.log('');

  // One page of every price that carries one of our lookup keys. Fetching by
  // lookup_key in a loop would be one round trip per entry; this is a handful.
  const existing = new Map();
  for await (const price of stripe.prices.list({ limit: 100, active: true, expand: ['data.product'] })) {
    if (price.lookup_key) existing.set(price.lookup_key, price);
  }

  const missing = [];
  const mismatched = [];
  let matched = 0;

  for (const entry of catalog) {
    const found = existing.get(entry.lookupKey);
    if (!found) {
      missing.push(entry);
    } else if (found.unit_amount !== entry.unitAmountCents) {
      mismatched.push({ entry, found });
    } else {
      matched++;
    }
  }

  /*
    Orphans: active prices we created that the code no longer asks for.

    Matched by our own lookup-key prefix, so a price belonging to anything else
    sharing this Stripe account is never touched — the account is shared, and
    this script has no business retiring somebody else's product.
  */
  const wanted = new Set(catalog.map((e) => e.lookupKey));
  const orphans = [...existing.values()].filter(
    (p) => p.lookup_key?.startsWith('hbcfield_') && !wanted.has(p.lookup_key),
  );

  if (mismatched.length) {
    console.log('  ⚠  PRICE MISMATCH — Stripe charges something the code does not say');
    console.log('     Not fixed automatically: Stripe prices are immutable and customers are');
    console.log('     subscribed to these. Create a new price and migrate deliberately.');
    console.log('');
    for (const { entry, found } of mismatched) {
      console.log(`     ${pad(entry.lookupKey, 40)} code ${pad(eur(entry.unitAmountCents), 10)} stripe ${eur(found.unit_amount ?? 0)}`);
    }
    console.log('');
  }

  console.log(`  ${matched} already correct`);
  console.log('');

  if (orphans.length) {
    console.log(`  ${orphans.length} ORPHANED — active in Stripe, not in the price list:`);
    console.log('');
    for (const p of orphans) {
      console.log(`     ${pad(p.lookup_key, 40)} ${pad(eur(p.unit_amount ?? 0), 10)} / ${p.recurring?.interval ?? '?'}`);
    }
    console.log('');
    if (!ARCHIVE) console.log('     Re-run with --archive-orphans to retire them (reversible, and');
    if (!ARCHIVE) console.log('     skipped for any price a subscription still points at).');
    console.log('');
  }

  if (!missing.length) {
    console.log('  Nothing to create.');
  } else {
    console.log(`  ${APPLY ? 'CREATING' : 'WOULD CREATE'} ${missing.length}:`);
    console.log('');
    for (const e of missing) {
      console.log(`     ${pad(e.lookupKey, 40)} ${pad(eur(e.unitAmountCents), 10)} / ${e.recurring}   ${e.productName}`);
    }
    console.log('');
  }

  if (!APPLY && !ARCHIVE) {
    console.log(missing.length ? '  Re-run with --apply to create them.' : '');
    console.log('');
    process.exit(mismatched.length ? 2 : 0);
  }

  // ── archive orphans ──────────────────────────────────────────────────────
  if (ARCHIVE && orphans.length) {
    let archived = 0;
    for (const price of orphans) {
      // The guard that makes this safe: if anything is subscribed to it, the
      // price stays. Archiving a price under a live subscription does not stop
      // the billing, but it does make the line unexplainable in the dashboard
      // and unrecreatable if it ever has to be reinstated.
      const subs = await stripe.subscriptions.list({ price: price.id, status: 'all', limit: 1 });
      if (subs.data.length) {
        console.log(`     ! kept     ${pad(price.lookup_key, 40)} — ${subs.data.length}+ subscription(s) use it`);
        continue;
      }
      await stripe.prices.update(price.id, { active: false });
      archived++;
      console.log(`     - archived ${price.lookup_key}`);
    }
    console.log('');
    console.log(`  Archived ${archived} of ${orphans.length}.`);
    console.log('');
  }

  if (!APPLY) {
    console.log('');
    process.exit(mismatched.length ? 2 : 0);
  }

  // ── apply ────────────────────────────────────────────────────────────────
  // One product per billable thing; its price is the monthly one, because that
  // is the only interval there is.
  const productByName = new Map();
  for await (const p of stripe.products.list({ limit: 100, active: true })) productByName.set(p.name, p.id);

  let created = 0;
  for (const e of missing) {
    let productId = productByName.get(e.productName);
    if (!productId) {
      const product = await stripe.products.create({
        name: e.productName,
        metadata: { hbcfield_kind: e.kind, hbcfield_key: e.key },
      });
      productId = product.id;
      productByName.set(e.productName, productId);
      console.log(`     + product  ${e.productName}`);
    }

    await stripe.prices.create({
      product: productId,
      currency: 'eur',
      unit_amount: e.unitAmountCents,
      recurring: { interval: e.recurring },
      lookup_key: e.lookupKey,
      // Prices are quoted excluding VAT; Stripe Tax adds it at checkout. This
      // must match how the tier prices were set up or the same customer sees
      // two different tax behaviours on one invoice.
      tax_behavior: 'exclusive',
      metadata: { hbcfield_kind: e.kind, hbcfield_key: e.key },
    });
    created++;
    console.log(`     + price    ${pad(e.lookupKey, 40)} ${eur(e.unitAmountCents)}`);
  }

  console.log('');
  console.log(`  Created ${created}.`);
  console.log('');
  process.exit(mismatched.length ? 2 : 0);
}

main().catch((err) => {
  console.error('');
  console.error('  Sync failed:', err?.message ?? err);
  console.error('');
  process.exit(1);
});
