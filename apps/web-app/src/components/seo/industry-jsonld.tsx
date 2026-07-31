import { SITE_URL } from "@/lib/marketing-seo";
import {
  homeCopy,
  industryData,
  INDUSTRY_SLUGS,
  industryPath,
  industriesHubPath,
  localePath,
} from "@/lib/industries";

/**
 * Server-rendered JSON-LD for the industry pages. Built entirely from copy
 * already published on the site (per-industry name/benefit + the shared nav
 * labels), so nothing here introduces a new claim. Emitted per-locale with the
 * localized names and canonical URLs.
 *
 * - Detail page: BreadcrumbList (Home → Industries → <industry>) + Service
 *   (the product offered for that vertical, provided by the Organization).
 * - Hub page: BreadcrumbList (Home → Industries) + ItemList of the verticals.
 */

const abs = (rel: string) => `${SITE_URL}${rel === "/" ? "" : rel}`;

function jsonLd(graph: unknown) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}

export function IndustryJsonLd({ lang, slug }: { lang: string; slug: string }) {
  const home = homeCopy(lang);
  const ind = industryData(lang, slug);
  if (!ind) return null;

  const industriesLabel = home.nav?.industries ?? "Industries";
  const url = abs(industryPath(lang, slug));

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "HBCField", item: abs(localePath(lang)) },
          { "@type": "ListItem", position: 2, name: industriesLabel, item: abs(industriesHubPath(lang)) },
          { "@type": "ListItem", position: 3, name: ind.name, item: url },
        ],
      },
      {
        "@type": "Service",
        "@id": `${url}#service`,
        name: ind.name,
        serviceType: ind.name,
        description: ind.benefit,
        url,
        provider: { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "HBCField" },
        areaServed: { "@type": "Country", name: "Austria" },
        audience: { "@type": "Audience", audienceType: ind.who },
      },
    ],
  };

  return jsonLd(graph);
}

export function IndustriesHubJsonLd({ lang }: { lang: string }) {
  const home = homeCopy(lang);
  const fields = home.industries?.fields ?? [];
  const industriesLabel = home.nav?.industries ?? "Industries";
  const hubUrl = abs(industriesHubPath(lang));

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "HBCField", item: abs(localePath(lang)) },
          { "@type": "ListItem", position: 2, name: industriesLabel, item: hubUrl },
        ],
      },
      {
        "@type": "ItemList",
        "@id": `${hubUrl}#industries`,
        itemListElement: INDUSTRY_SLUGS.map((slug, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: fields[i]?.name ?? slug,
          url: abs(industryPath(lang, slug)),
        })),
      },
    ],
  };

  return jsonLd(graph);
}
