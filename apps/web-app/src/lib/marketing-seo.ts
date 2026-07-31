/**
 * Single source of truth for marketing SEO across locales (DRY).
 * English is the default (served at `/`); de/es/fr/it are served at `/{lang}`.
 * Titles/descriptions are faithful translations of the English SEO metadata —
 * product facts are unchanged, only the language of the meta strings differs.
 */

export const SITE_URL = "https://hbcfield.com";
export const DEFAULT_LOCALE = "en" as const;
export const MARKETING_LOCALES = ["de", "es", "fr", "it"] as const;
export type MarketingLocale = (typeof MARKETING_LOCALES)[number];
export const ALL_LOCALES = [DEFAULT_LOCALE, ...MARKETING_LOCALES] as const;

type Meta = { title: string; description: string };

// Full <title> (already includes "HBCField" — use as absolute, no template).
export const LOCALE_META: Record<string, Meta> = {
  en: {
    title: "HBCField — Field Service Management, Time & Attendance Software",
    description:
      "HBCField unifies task dispatch, GPS tracking, employee time & attendance, service reports and invoicing for field teams — in real time on web and mobile.",
  },
  de: {
    title: "HBCField — Außendienst-Management, Zeit- & Anwesenheitssoftware",
    description:
      "HBCField vereint Auftragsdisposition, GPS-Tracking, Arbeitszeit- & Anwesenheitserfassung, Serviceberichte und Rechnungsstellung für Außendienstteams — in Echtzeit auf Web und Mobile.",
  },
  es: {
    title: "HBCField — Software de gestión de servicios de campo y control horario",
    description:
      "HBCField unifica la asignación de tareas, el seguimiento GPS, el control horario y de asistencia, los informes de servicio y la facturación para equipos de campo, en tiempo real en web y móvil.",
  },
  fr: {
    title: "HBCField — Gestion des interventions terrain, temps & présence",
    description:
      "HBCField réunit la répartition des tâches, le suivi GPS, le temps et la présence, les rapports d’intervention et la facturation pour les équipes terrain — en temps réel sur le web et le mobile.",
  },
  it: {
    title: "HBCField — Gestione servizi sul campo, presenze e orari",
    description:
      "HBCField unifica l’assegnazione dei lavori, il tracciamento GPS, presenze e orari, i rapporti di servizio e la fatturazione per i team sul campo, in tempo reale su web e mobile.",
  },
};

export function localeMeta(lang: string): Meta {
  return LOCALE_META[lang] ?? LOCALE_META.en;
}

/** Path for a locale's homepage: `/` for English, `/de` etc. otherwise. */
export function localePath(lang: string): string {
  return lang === DEFAULT_LOCALE ? "/" : `/${lang}`;
}

/** hreflang map for `alternates.languages` (+ x-default → English). */
export function hreflangAlternates(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const l of ALL_LOCALES) map[l] = localePath(l);
  map["x-default"] = localePath(DEFAULT_LOCALE);
  return map;
}

/** BCP-47-ish OG locale token. */
export function ogLocale(lang: string): string {
  return { en: "en", de: "de_DE", es: "es_ES", fr: "fr_FR", it: "it_IT" }[lang] ?? "en";
}
