'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Search, Rocket, Users, ClipboardList, MapPin, CreditCard, LifeBuoy, ArrowRight, ArrowLeft, type LucideIcon } from 'lucide-react';
import { AnimatedLogo } from '@hbcfield/shared/components';
import { CATEGORIES, ARTICLES, articlesByCategory, searchArticles, pick, type HelpCategory } from './_content/articles';

const ICONS: Record<HelpCategory['icon'], LucideIcon> = {
  rocket: Rocket,
  users: Users,
  clipboard: ClipboardList,
  map: MapPin,
  card: CreditCard,
  lifebuoy: LifeBuoy,
};

export default function HelpCenterPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [query, setQuery] = useState('');

  const results = useMemo(() => searchArticles(query, lang), [query, lang]);

  return (
    <div className="min-h-screen bg-white text-slate-600 [color-scheme:light]">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Link href="/" aria-label="HBCField">
            <AnimatedLogo size="small" />
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-1.5 text-[13px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t('help.backToApp', 'Back to app')}
          </Link>
        </div>
      </header>

      {/* Hero + search */}
      <section className="border-b border-slate-200/70 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            {t('help.title', 'How can we help?')}
          </h1>
          <p className="mt-3 text-[15px] text-slate-500">
            {t('help.subtitle', 'Search our guides, or browse by topic below.')}
          </p>
          <div className="relative mx-auto mt-7 max-w-xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('help.searchPlaceholder', 'Search for answers…')}
              className="w-full rounded-full border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-[15px] text-slate-800 shadow-sm outline-none transition-colors focus:border-blue-400"
            />
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-6 py-12">
        {query ? (
          /* Search results */
          <div>
            <p className="mb-5 text-sm text-slate-500">
              {results.length} {t('help.resultsFor', 'result(s) for')} “{query}”
            </p>
            <div className="space-y-2">
              {results.map((a) => (
                <Link
                  key={a.slug}
                  href={`/help/${a.slug}`}
                  className="block rounded-xl border border-slate-200 p-4 transition-colors hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="font-medium text-slate-800">{pick(a.title, lang)}</div>
                  <div className="mt-0.5 text-sm text-slate-500">{pick(a.excerpt, lang)}</div>
                </Link>
              ))}
              {results.length === 0 && (
                <p className="py-10 text-center text-sm text-slate-400">{t('help.noResults', 'No articles matched. Try different words.')}</p>
              )}
            </div>
          </div>
        ) : (
          /* Category grid */
          <div className="space-y-12">
            {CATEGORIES.map((cat) => {
              const Icon = ICONS[cat.icon];
              const list = articlesByCategory(cat.key);
              if (list.length === 0) return null;
              return (
                <section key={cat.key}>
                  <div className="mb-4 flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">{pick(cat.title, lang)}</h2>
                      <p className="text-[13px] text-slate-500">{pick(cat.blurb, lang)}</p>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {list.map((a) => (
                      <Link
                        key={a.slug}
                        href={`/help/${a.slug}`}
                        className="group flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-4 transition-colors hover:border-slate-300 hover:bg-slate-50"
                      >
                        <span>
                          <span className="block font-medium text-slate-800">{pick(a.title, lang)}</span>
                          <span className="mt-0.5 block text-[13px] leading-snug text-slate-500">{pick(a.excerpt, lang)}</span>
                        </span>
                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer CTA */}
      <footer className="border-t border-slate-200/70 bg-slate-50">
        <div className="mx-auto max-w-3xl px-6 py-12 text-center">
          <p className="text-[15px] font-medium text-slate-800">{t('help.stillStuck', "Can't find what you need?")}</p>
          <p className="mt-1 text-sm text-slate-500">{t('help.stillStuckSub', 'Open the support button in the app to reach our team.')}</p>
          <div className="mt-5">
            <span className="text-sm text-slate-400">{ARTICLES.length} {t('help.articleCount', 'articles')}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
