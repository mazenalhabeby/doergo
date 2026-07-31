import en from "@/i18n/locales/en.json";

/**
 * FAQPage JSON-LD for Google rich results + AI answer engines. Built from the
 * SAME source as the visible English FAQ (home.faq.items in en.json), so the
 * schema always matches the on-page content — a Google requirement. Rendered
 * only on the English homepage `/` (the localized pages show translated FAQs
 * without schema, which is valid).
 */
export function FaqJsonLd() {
  const items = (en as { home?: { faq?: { items?: { q: string; a: string }[] } } })?.home?.faq?.items;
  if (!items?.length) return null;

  const graph = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
