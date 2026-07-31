/**
 * Server-rendered JSON-LD for the marketing homepage. Feeds Google rich results
 * and AI answer engines (ChatGPT / Perplexity / Google AI Overviews) a precise,
 * machine-readable description of the product, org, and app.
 *
 * Keep facts here accurate — AI engines quote them. Prices are expressed as an
 * AggregateOffer (lowPrice = cheapest seat) to stay correct as tiers change.
 */

const SITE = "https://hbcfield.com";
const IOS_URL = "https://apps.apple.com/app/id6762745260";
const ANDROID_URL = "https://play.google.com/store/apps/details?id=com.hbcfield.app";

const graph = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE}/#organization`,
      name: "HBCField",
      url: SITE,
      logo: `${SITE}/favicon.png`,
      description:
        "HBCField is a field service management platform that unifies task dispatch, GPS tracking, employee time & attendance, and reporting for field teams.",
      sameAs: [IOS_URL, ANDROID_URL],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE}/#website`,
      url: SITE,
      name: "HBCField",
      publisher: { "@id": `${SITE}/#organization` },
      inLanguage: ["en", "de", "es", "fr", "it"],
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE}/#software`,
      name: "HBCField",
      url: SITE,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web, iOS, Android",
      description:
        "Field service management software that unifies task dispatch and assignment, GPS route tracking, employee time & attendance with geofencing, service reports, scheduling and invoicing — in real time on web and mobile.",
      featureList: [
        "Task dispatch and technician assignment",
        "Real-time GPS route tracking",
        "Employee time & attendance with geofencing",
        "Digital service reports and signatures",
        "Scheduling and availability",
        "Invoicing and reporting",
      ],
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "EUR",
        lowPrice: "19",
        offerCount: "3",
        availability: "https://schema.org/InStock",
      },
      publisher: { "@id": `${SITE}/#organization` },
      downloadUrl: [IOS_URL, ANDROID_URL],
    },
  ],
};

export function StructuredData() {
  return (
    <script
      type="application/ld+json"
      // JSON-LD is static, server-rendered — safe to inline.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
