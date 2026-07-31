import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IndustriesHub } from "../../_industries/IndustriesHub";
import { homeCopy, hubHreflang, industriesHubPath } from "@/lib/industries";
import { MARKETING_LOCALES } from "@/lib/marketing-seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return MARKETING_LOCALES.map((lang) => ({ lang }));
}

type Params = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { lang } = await params;
  const home = homeCopy(lang);
  return {
    title: { absolute: `${home.nav?.industries ?? "Industries"} — HBCField` },
    description: home.industries?.lead,
    alternates: { canonical: industriesHubPath(lang), languages: hubHreflang() },
  };
}

export default async function Page({ params }: Params) {
  const { lang } = await params;
  if (!(MARKETING_LOCALES as readonly string[]).includes(lang)) notFound();
  return <IndustriesHub lang={lang} />;
}
