"use client";

import { useMemo } from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { createInstance } from "i18next";
import HomeClient from "./HomeClient";
import en from "@/i18n/locales/en.json";
import de from "@/i18n/locales/de.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";
import it from "@/i18n/locales/it.json";

// These JSONs are already in the bundle (the global i18n imports them), so this
// adds no payload. A fresh, request-scoped i18next instance pinned to `lang`
// lets HomeClient render the target language on the SERVER too (not just after
// hydration) — so crawlers/AI get the localized body at /de, /es, /fr, /it.
export default function LocalizedHome({ lang }: { lang: string }) {
  const instance = useMemo(() => {
    const inst = createInstance();
    inst.use(initReactI18next).init({
      resources: {
        en: { translation: en },
        de: { translation: de },
        es: { translation: es },
        fr: { translation: fr },
        it: { translation: it },
      },
      lng: lang,
      fallbackLng: "en",
      interpolation: { escapeValue: false },
    });
    return inst;
  }, [lang]);

  return (
    <I18nextProvider i18n={instance}>
      <HomeClient />
    </I18nextProvider>
  );
}
