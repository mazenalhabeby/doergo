'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { AnimatedLogo } from '@hbcfield/shared/components';
// Types only: importing a value from articles.ts would ship the whole catalogue
// (~40 kB of every article in both languages) to read one.
import type { Lang, Localized } from '../../_content/articles';

/** Same rule as `pick` in articles.ts. */
const langOf = (lang: string | undefined): Lang => (lang?.startsWith('de') ? 'de' : 'en');
const pick = (v: Localized, lang: string | undefined): string => v[langOf(lang)];

interface ArticleViewProps {
  title: Localized;
  excerpt: Localized;
  categoryTitle: Localized | null;
  related: { slug: string; title: Localized }[];
  /** The body, already rendered from Markdown ON THE SERVER, once per language. */
  body: Record<Lang, ReactNode>;
}

/**
 * The help article's chrome. Only the language choice happens here: the reader
 * may have switched the app to German, which the server cannot know. Everything
 * heavy — the article text and its Markdown rendering (react-markdown, remark)
 * — was done by the server, so the browser gets HTML, crawlers get the text,
 * and the parser never ships.
 */
export function ArticleView({ title, excerpt, categoryTitle, related, body }: ArticleViewProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const bodyLang = langOf(lang);

  return (
    <div className="min-h-screen bg-white text-slate-600 [color-scheme:light]">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
          <Link href="/" aria-label="HBCField">
            <AnimatedLogo size="small" />
          </Link>
          <Link
            href="/help"
            className={"inline-flex items-center gap-1.5 rounded-full border border-slate-200 " +
              "px-3.5 py-1.5 text-[13px] font-medium text-slate-600 transition-colors " +
              "hover:border-slate-300 hover:text-slate-900"}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t('help.allArticles', 'All articles')}
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-6 py-10">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-1.5 text-[13px] text-slate-400">
          <Link href="/help" className="hover:text-slate-600">
            {t('help.title', 'Help')}
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          {categoryTitle && <span className="text-slate-500">{pick(categoryTitle, lang)}</span>}
        </nav>

        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{pick(title, lang)}</h1>
        <p className="mt-2 text-[15px] text-slate-500">{pick(excerpt, lang)}</p>

        <div className="mt-6 border-t border-slate-100 pt-2">{body[bodyLang]}</div>

        {/* Support CTA */}
        <div className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
          <p className="text-[15px] font-medium text-slate-800">{t('help.stillStuck', "Can't find what you need?")}</p>
          <p className="mt-1 text-sm text-slate-500">{t('help.stillStuckSub', 'Open the support button in the app to reach our team.')}</p>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <div className="mt-10">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{t('help.related', 'Related articles')}</h2>
            <div className="space-y-2">
              {related.map((a) => (
                <Link
                  key={a.slug}
                  href={`/help/${a.slug}`}
                  className={"flex items-center justify-between gap-3 rounded-xl border " +
                    "border-slate-200 p-3.5 transition-colors hover:border-slate-300 " +
                    "hover:bg-slate-50"}
                >
                  <span className="text-[14px] font-medium text-slate-700">{pick(a.title, lang)}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
