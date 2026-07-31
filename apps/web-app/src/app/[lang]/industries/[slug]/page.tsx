import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IndustryArticle } from "../../../_industries/IndustryArticle";
import { INDUSTRY_SLUGS, isIndustrySlug, industryData, industryHreflang, industryPath } from "@/lib/industries";
import { MARKETING_LOCALES } from "@/lib/marketing-seo";

export const dynamicParams = false;

export function generateStaticParams() {
  const params: { lang: string; slug: string }[] = [];
  for (const lang of MARKETING_LOCALES) {
    for (const slug of INDUSTRY_SLUGS) params.push({ lang, slug });
  }
  return params;
}

type Params = { params: Promise<{ lang: string; slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { lang, slug } = await params;
  const ind = industryData(lang, slug);
  if (!ind) return {};
  return {
    title: { absolute: `${ind.name} — HBCField` },
    description: ind.benefit,
    alternates: { canonical: industryPath(lang, slug), languages: industryHreflang(slug) },
  };
}

export default async function Page({ params }: Params) {
  const { lang, slug } = await params;
  if (!(MARKETING_LOCALES as readonly string[]).includes(lang) || !isIndustrySlug(slug)) notFound();
  return <IndustryArticle lang={lang} slug={slug} />;
}
