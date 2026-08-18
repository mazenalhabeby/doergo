import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllPosts, getFilePosts, getPost, formatPostDate } from "@/lib/blog";
import { SITE_URL } from "@/lib/marketing-seo";
import { BlogMarkdown } from "../_components/blog-markdown";
import { SiteNav } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";

const DISPLAY = "font-[family:var(--font-familjen)]";
const MONO = "font-[family:var(--font-martian)]";

// DB-backed posts publish without a deploy: file posts are prebuilt, new DB
// slugs render on demand and are then cached for the revalidation window.
export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams() {
  return getFilePosts().map((p) => ({ slug: p.slug }));
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return {};
  return {
    title: { absolute: `${post.title} — HBCField Blog` },
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      publishedTime: post.date,
      url: `${SITE_URL}/blog/${post.slug}`,
      ...(post.cover ? { images: [{ url: post.cover.startsWith("http") ? post.cover : `${SITE_URL}${post.cover}` }] } : {}),
    },
  };
}

export default async function BlogPostPage({ params }: Params) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const others = (await getAllPosts()).filter((p) => p.slug !== post.slug).slice(0, 4);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: { "@type": "Organization", name: post.author },
    publisher: { "@type": "Organization", name: "HBCField", url: SITE_URL },
    mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
  };

  return (
    // `dark` wrapper: the blog is always dark, so the shared nav/footer's
    // theme tokens must resolve to the dark palette regardless of user theme.
    <main className={`dark min-h-screen bg-[#0e1116] text-[#d8d8d8] ${DISPLAY}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteNav active="blog" />

      <div className="mx-auto max-w-[820px]">
        {/* Breadcrumb (pt clears the fixed navbar) */}
        <nav className={`${MONO} px-6 pt-28 text-[10px] uppercase tracking-[0.16em] text-white/35 sm:px-10`}>
          <Link href="/" className="hover:text-white/70">HBCField</Link>
          <span className="mx-1.5">/</span>
          <Link href="/blog" className="hover:text-white/70">Blog</Link>
        </nav>

        {/* Header */}
        <header className="px-6 pt-8 sm:px-10 sm:pt-12">
          <h1 className={`text-[clamp(1.8rem,5vw,3rem)] font-normal leading-[1.08] tracking-[-0.02em] text-[#f2f2f0]`}>
            {post.title}
          </h1>
          <div className={`${MONO} mt-6 text-[10px] uppercase tracking-[0.16em] text-white/35`}>
            {formatPostDate(post.date)} · {post.readingMinutes} min read · {post.author}
          </div>
        </header>

        {/* Cover image */}
        {post.cover && (
          <div className="px-6 pt-8 sm:px-10">
            {/* eslint-disable-next-line @next/next/no-img-element -- author-provided static asset */}
            <img src={post.cover} alt="" className="w-full rounded-xl border border-white/[0.08]" />
          </div>
        )}

        {/* Body */}
        <article className="px-6 pb-8 pt-6 sm:px-10">
          <BlogMarkdown>{post.content}</BlogMarkdown>
        </article>

        {/* CTA */}
        <section className="border-t border-white/[0.08] px-6 py-16 sm:px-10">
          <p className={`max-w-[26ch] text-[clamp(1.4rem,3.5vw,2.2rem)] leading-[1.1] tracking-[-0.02em] text-[#f2f2f0]`}>
            Run your field team on one platform.
          </p>
          <Link
            href="/register"
            className="mt-8 inline-block rounded-full bg-[#f2f2f0] px-6 py-3 text-[14px] font-semibold text-[#0e1116] transition-opacity hover:opacity-90"
          >
            Start free trial
          </Link>
        </section>

        {/* More posts */}
        {others.length > 0 && (
          <section className="border-t border-white/[0.08] px-6 py-14 sm:px-10">
            <div className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-white/35`}>More from the blog</div>
            <ul className="mt-6 space-y-3">
              {others.map((p) => (
                <li key={p.slug}>
                  <Link href={`/blog/${p.slug}`} className="text-[16px] text-white/70 transition-colors hover:text-[#f2f2f0]">
                    {p.title} →
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

      </div>

      <SiteFooter />
    </main>
  );
}
