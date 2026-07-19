'use client';

import { useParams, notFound } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { AnimatedLogo } from '@hbcfield/shared/components';
import { getArticle, articlesByCategory, CATEGORIES, pick } from '../_content/articles';
import { Markdown } from '../_components/markdown';

export default function HelpArticlePage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const params = useParams<{ slug: string }>();
  const article = getArticle(String(params.slug));

  if (!article) return notFound();

  const category = CATEGORIES.find((c) => c.key === article.category);
  const related = articlesByCategory(article.category).filter((a) => a.slug !== article.slug);

  return (
    <div className="min-h-screen bg-white text-slate-600 [color-scheme:light]">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
          <Link href="/" aria-label="HBCField">
            <AnimatedLogo size="small" />
          </Link>
          <Link
            href="/help"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-1.5 text-[13px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
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
          {category && <span className="text-slate-500">{pick(category.title, lang)}</span>}
        </nav>

        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{pick(article.title, lang)}</h1>
        <p className="mt-2 text-[15px] text-slate-500">{pick(article.excerpt, lang)}</p>

        <div className="mt-6 border-t border-slate-100 pt-2">
          <Markdown>{pick(article.body, lang)}</Markdown>
        </div>

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
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3.5 transition-colors hover:border-slate-300 hover:bg-slate-50"
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
