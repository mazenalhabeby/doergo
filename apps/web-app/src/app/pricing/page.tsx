import type { Metadata } from "next"
import PricingClient from "../_pricing/PricingClient"
import { MarketingCopy } from "@/components/marketing/marketing-copy"
import { marketingCopy } from "@/i18n/server-bundles"

// Public by construction: only the `(dashboard)` group carries the auth gate, so
// a top-level route needs no opt-out. A price somebody has to sign up to see is
// a price they assume is bad.
export const metadata: Metadata = {
  title: "Pricing — every price, on one page",
  description:
    "No plans and no tiers. €9.99 per person, plus what each site switches " +
    "on, plus anything bought once for the company. Work out your own bill " +
    "with the calculator.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "HBCField pricing — every price, on one page",
    description:
      "No plans, no tiers, nothing behind “contact sales”. Calculate exactly what HBCField costs your business.",
    url: "https://hbcfield.com/pricing",
  },
}

export default function Page() {
  return (
    <MarketingCopy en={marketingCopy("en", ["pricing", "home"])}>
      <PricingClient />
    </MarketingCopy>
  )
}
