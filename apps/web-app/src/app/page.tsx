import type { Metadata } from "next";
import { StructuredData } from "@/components/seo/structured-data";
import HomeClient from "./_home/HomeClient";

// Homepage-specific metadata (title/description/OG come from the rich defaults in
// layout.tsx). We add the canonical here and mount server-rendered JSON-LD so the
// page is fully machine-readable for Google and AI answer engines.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Page() {
  return (
    <>
      <StructuredData />
      <HomeClient />
    </>
  );
}
