"use client";

import { useMemo } from "react";
import { I18nextProvider } from "react-i18next";
import { createInstance, type InitOptions } from "i18next";
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
//
// ⚠️ DO NOT `.use(initReactI18next)` HERE. That plugin's whole job is to register
// its instance as react-i18next's GLOBAL DEFAULT — the one every `useTranslation()`
// without a provider resolves to. Calling it on a per-language instance made
// rendering /it silently repoint the default at Italian, and the English home page
// at `/` — which has no provider — then served Italian to everyone until the next
// build. One long-lived server process, last localized request wins: a bug that
// cannot reproduce locally and is invisible unless you read the served HTML.
//
// The provider below is what HomeClient actually reads: `useTranslation` prefers
// the instance in context, so this instance reaches the tree without ever being
// published as a global.
export default function LocalizedHome({ lang }: { lang: string }) {
  const instance = useMemo(() => {
    const inst = createInstance();
    const options: InitOptions = {
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
    };
    inst.init(options);
    return inst;
  }, [lang]);

  return (
    <I18nextProvider i18n={instance}>
      <HomeClient lang={lang} />
    </I18nextProvider>
  );
}
