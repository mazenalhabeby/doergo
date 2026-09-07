"use client";

import { useMemo } from "react";
import { I18nextProvider } from "react-i18next";
import { createInstance, type InitOptions, type Resource } from "i18next";
import HomeClient from "./HomeClient";

/**
 * The localized marketing home (`/de`, `/es`, `/fr`, `/it`).
 *
 * A fresh, request-scoped i18next instance pinned to `lang` lets HomeClient
 * render the target language on the SERVER as well as after hydration, so
 * crawlers and AI answer engines get the localized body rather than English.
 *
 * ⚠️ DO NOT `.use(initReactI18next)` HERE. That plugin's whole job is to register
 * its instance as react-i18next's GLOBAL DEFAULT — the one every `useTranslation()`
 * without a provider resolves to. Calling it on a per-language instance made
 * rendering /it silently repoint the default at Italian, and the English home page
 * at `/` — which has no provider — then served Italian to everyone until the next
 * build. One long-lived server process, last localized request wins: a bug that
 * cannot reproduce locally and is invisible unless you read the served HTML.
 *
 * The provider below is what HomeClient actually reads: `useTranslation` prefers
 * the instance in context, so this instance reaches the tree without ever being
 * published as a global.
 *
 * ⚠️ `resources` ARRIVES AS A PROP, and must keep doing so. This component used
 * to import all five locale JSONs itself, on the reasoning that they were "already
 * in the bundle so this adds no payload" — which was true only because the global
 * i18n imported them too, and stopped being true the moment that was fixed. A
 * `'use client'` file importing them is what puts them in the browser. The server
 * page reads the one language it is rendering and passes it down, so `/de` ships
 * German and `/` ships nothing.
 */
export default function LocalizedHome({
  lang,
  resources,
}: {
  lang: string;
  resources: Resource;
}) {
  const instance = useMemo(() => {
    const inst = createInstance();
    const options: InitOptions = {
      resources,
      lng: lang,
      // No English fallback bundle is shipped alongside: the server sends the
      // requested language complete, and `fallbackLng` pointing at a locale
      // that is not in `resources` would resolve to raw keys rather than to
      // English. Pinning it to `lang` keeps the miss behaviour honest.
      fallbackLng: lang,
      interpolation: { escapeValue: false },
    };
    inst.init(options);
    return inst;
  }, [lang, resources]);

  return (
    <I18nextProvider i18n={instance}>
      <HomeClient lang={lang} />
    </I18nextProvider>
  );
}
