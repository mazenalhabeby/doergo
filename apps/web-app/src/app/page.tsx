import type { Metadata } from "next";
import { StructuredData } from "@/components/seo/structured-data";
import { FaqJsonLd } from "@/components/seo/faq-jsonld";
import HomeClient from "./_home/HomeClient";
import { hreflangAlternates } from "@/lib/marketing-seo";

// Homepage-specific metadata (title/description/OG come from the rich defaults in
// layout.tsx). Canonical + hreflang declare the English default and its de/es/fr/it
// alternates; JSON-LD is server-rendered for Google + AI answer engines.
export const metadata: Metadata = {
  alternates: {
    canonical: "/",
    languages: hreflangAlternates(),
  },
};

export default function Page() {
  return (
    <>
      <StructuredData />
      <FaqJsonLd />
      <HomeClient />
    </>
  );
}
