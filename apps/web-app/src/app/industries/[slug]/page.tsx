import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IndustryArticle } from "../../_industries/IndustryArticle";
import { INDUSTRY_SLUGS, isIndustrySlug, industryData, industryHreflang, industryPath } from "@/lib/industries";
import { DEFAULT_LOCALE } from "@/lib/marketing-seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return INDUSTRY_SLUGS.map((slug) => ({ slug }));
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const ind = industryData(DEFAULT_LOCALE, slug);
  if (!ind) return {};
  return {
    title: { absolute: `${ind.name} — HBCField` },
    description: ind.benefit,
    alternates: { canonical: industryPath(DEFAULT_LOCALE, slug), languages: industryHreflang(slug) },
  };
}

export default async function Page({ params }: Params) {
  const { slug } = await params;
  if (!isIndustrySlug(slug)) notFound();
  return <IndustryArticle lang={DEFAULT_LOCALE} slug={slug} />;
}
