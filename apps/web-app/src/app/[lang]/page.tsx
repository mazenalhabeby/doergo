import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StructuredData } from "@/components/seo/structured-data";
import LocalizedHome from "../_home/LocalizedHome";
import {
  MARKETING_LOCALES,
  localeMeta,
  localePath,
  hreflangAlternates,
  ogLocale,
  SITE_URL,
} from "@/lib/marketing-seo";

// Only the 4 non-default locales are valid here; anything else → 404. Static
// marketing routes (/privacy, /help, …) take precedence over this dynamic
// segment, so they are never captured.
export const dynamicParams = false;

export function generateStaticParams() {
  return MARKETING_LOCALES.map((lang) => ({ lang }));
}

type Params = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { lang } = await params;
  const meta = localeMeta(lang);
  return {
    title: { absolute: meta.title },
    description: meta.description,
    alternates: {
      canonical: localePath(lang),
      languages: hreflangAlternates(),
    },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: `${SITE_URL}${localePath(lang)}`,
      locale: ogLocale(lang),
    },
  };
}

export default async function Page({ params }: Params) {
  const { lang } = await params;
  if (!(MARKETING_LOCALES as readonly string[]).includes(lang)) notFound();
  return (
    <>
      <StructuredData />
      <LocalizedHome lang={lang} />
    </>
  );
}
