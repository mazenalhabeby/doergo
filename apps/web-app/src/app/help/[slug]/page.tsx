import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ARTICLES, getArticle, articlesByCategory, CATEGORIES } from '../_content/articles';
import { Markdown } from '../_components/markdown';
import { ArticleView } from './article-view';

/*
  A SERVER page, like the blog. It used to be a client component: the whole
  help catalogue and react-markdown went to every browser, and a crawler saw an
  empty page until JavaScript ran. Now the article is rendered to HTML here —
  both languages, since the reader's language is a client-side choice — and the
  client part only picks one.
*/

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return {};
  return {
    title: article.title.en,
    description: article.excerpt.en,
    alternates: { canonical: `/help/${article.slug}` },
  };
}

export default async function HelpArticlePage({ params }: Params) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  const category = CATEGORIES.find((c) => c.key === article.category);
  const related = articlesByCategory(article.category)
    .filter((a) => a.slug !== article.slug)
    .map((a) => ({ slug: a.slug, title: a.title }));

  return (
    <ArticleView
      title={article.title}
      excerpt={article.excerpt}
      categoryTitle={category?.title ?? null}
      related={related}
      body={{
        en: <Markdown>{article.body.en}</Markdown>,
        de: <Markdown>{article.body.de}</Markdown>,
      }}
    />
  );
}
