import type { Metadata } from "next"
import PrivacyClient from "./_components/page-client"
import { MarketingCopy } from "@/components/marketing/marketing-copy"
import { marketingCopy } from "@/i18n/server-bundles"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How HBCField collects, uses, stores, and protects your data.",
  alternates: { canonical: "/privacy" },
}

export default function Page() {
  return (
    <MarketingCopy en={marketingCopy("en", ["privacy"])}>
      <PrivacyClient />
    </MarketingCopy>
  )
}
