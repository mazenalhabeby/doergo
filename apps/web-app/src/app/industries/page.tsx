import type { Metadata } from "next";
import { IndustriesHub } from "../_industries/IndustriesHub";
import { homeCopy, hubHreflang, industriesHubPath } from "@/lib/industries";
import { DEFAULT_LOCALE } from "@/lib/marketing-seo";

export function generateMetadata(): Metadata {
  const home = homeCopy(DEFAULT_LOCALE);
  return {
    title: { absolute: `${home.nav?.industries ?? "Industries"} — HBCField` },
    description: home.industries?.lead,
    alternates: { canonical: industriesHubPath(DEFAULT_LOCALE), languages: hubHreflang() },
  };
}

export default function Page() {
  return <IndustriesHub lang={DEFAULT_LOCALE} />;
}
