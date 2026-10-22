import type { Metadata } from "next"
import TermsClient from "./_components/page-client"
import { MarketingCopy } from "@/components/marketing/marketing-copy"
import { marketingCopy } from "@/i18n/server-bundles"

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms and conditions governing use of HBCField.",
  alternates: { canonical: "/terms" },
}

export default function Page() {
  return (
    <MarketingCopy en={marketingCopy("en", ["terms"])}>
      <TermsClient />
    </MarketingCopy>
  )
}
