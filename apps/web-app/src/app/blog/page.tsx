import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts, formatPostDate } from "@/lib/blog";
import { SiteNav } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";

const DISPLAY = "font-[family:var(--font-familjen)]";
const MONO = "font-[family:var(--font-martian)]";

// DB-backed posts publish without a deploy — re-render at most every 5 minutes.
export const revalidate = 300;

export const metadata: Metadata = {
  title: { absolute: "Blog — HBCField" },
  description:
    "Practical writing on field service management: scheduling, GPS and attendance, digital service reports, and running field teams well.",
  alternates: { canonical: "/blog" },
};

export default async function BlogIndexPage() {
  const posts = await getAllPosts();

  return (
    // `dark` wrapper: the blog is always dark, so the shared nav/footer's
    // theme tokens must resolve to the dark palette regardless of user theme.
    <main className={`dark min-h-screen bg-[#0e1116] text-[#d8d8d8] ${DISPLAY}`}>
      <SiteNav active="blog" />

      <div className="mx-auto max-w-[1100px]">
        {/* Hero (pt clears the fixed navbar) */}
        <header className="px-6 pb-14 pt-28 sm:px-10 sm:pb-20 sm:pt-36">
          <div className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-white/35`}>Blog</div>
          <h1 className={`mt-4 text-[clamp(2rem,6vw,4rem)] font-normal leading-[1.03] tracking-[-0.02em] text-[#f2f2f0]`}>
            Field notes
          </h1>
          <p className="mt-6 max-w-[55ch] text-[18px] leading-relaxed text-white/70">
            Practical writing on running field teams — scheduling, attendance, GPS, and getting the paperwork out of the way of the work.
          </p>
        </header>

        {/* Post list */}
        <section className="border-t border-white/[0.08]">
          {posts.map((post) => (
            <article key={post.slug} className="border-b border-white/[0.08]">
              <Link href={`/blog/${post.slug}`} className="group block px-6 py-10 transition-colors hover:bg-white/[0.02] sm:px-10">
                <div className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-white/35`}>
                  {formatPostDate(post.date)} · {post.readingMinutes} min read
                </div>
                <h2 className={`mt-3 max-w-[30ch] text-[clamp(1.35rem,3vw,1.9rem)] leading-[1.15] tracking-[-0.01em] text-[#f2f2f0]`}>
                  {post.title}
                </h2>
                <p className="mt-3 max-w-[65ch] text-[15.5px] leading-relaxed text-white/55">{post.description}</p>
                <span className="mt-4 inline-block text-[14px] text-white/45 transition-colors group-hover:text-[#f2f2f0]">
                  Read article →
                </span>
              </Link>
            </article>
          ))}
          {posts.length === 0 && (
            <p className="px-6 py-16 text-white/50 sm:px-10">No posts yet — check back soon.</p>
          )}
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
