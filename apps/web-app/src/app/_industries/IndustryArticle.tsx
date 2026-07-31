import Link from "next/link";
import {
  homeCopy,
  industryData,
  INDUSTRY_SLUGS,
  industryPath,
  industriesHubPath,
  localePath,
} from "@/lib/industries";
import { IndustryJsonLd } from "@/components/seo/industry-jsonld";

const DISPLAY = "font-[family:var(--font-familjen)]";
const MONO = "font-[family:var(--font-martian)]";

/**
 * A single industry landing page — assembled entirely from copy already
 * published on the site (the per-industry who/how/benefit block + the shared
 * field-capability list + the CTA). No new claims. Server-rendered in `lang`.
 */
export function IndustryArticle({ lang, slug }: { lang: string; slug: string }) {
  const home = homeCopy(lang);
  const ind = industryData(lang, slug);
  if (!ind) return null;

  const fields = home.industries?.fields ?? [];
  const features = home.field?.features ?? [];
  const others = INDUSTRY_SLUGS.filter((s) => s !== slug);
  const homeHref = localePath(lang);
  const hubHref = industriesHubPath(lang);

  return (
    <main className={`min-h-screen bg-[#0e1116] text-[#d8d8d8] ${DISPLAY}`}>
      <IndustryJsonLd lang={lang} slug={slug} />
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-5 sm:px-10">
        <Link href={homeHref} className="text-[15px] font-semibold tracking-tight text-[#f2f2f0]">HBCField</Link>
        <Link href={`${homeHref}#pricing`} className={`${MONO} text-[11px] uppercase tracking-[0.2em] text-[#f2f2f0]`}>
          {home.cta?.requestDemo ?? "Start free trial"}
        </Link>
      </div>

      <div className="mx-auto max-w-[1100px]">
        {/* Breadcrumb */}
        <nav className={`${MONO} px-6 pt-10 text-[10px] uppercase tracking-[0.16em] text-white/35 sm:px-10`}>
          <Link href={homeHref} className="hover:text-white/70">HBCField</Link>
          <span className="mx-1.5">/</span>
          <Link href={hubHref} className="hover:text-white/70">{home.nav?.industries ?? "Industries"}</Link>
          <span className="mx-1.5">/</span>
          <span className="text-white/55">{ind.name}</span>
        </nav>

        {/* Hero */}
        <header className="px-6 pb-16 pt-8 sm:px-10 sm:pb-24 sm:pt-12">
          <h1 className={`${DISPLAY} text-[clamp(2rem,6vw,4rem)] font-normal leading-[1.03] tracking-[-0.02em] text-[#f2f2f0]`}>
            {ind.name}
          </h1>
          <p className="mt-6 max-w-[55ch] text-[18px] leading-relaxed text-white/70">{ind.benefit}</p>
        </header>

        {/* Who / How */}
        <section className="grid gap-10 border-t border-white/[0.08] px-6 py-16 sm:grid-cols-2 sm:px-10">
          <div>
            <div className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-white/35`}>{home.industries?.whoLabel ?? "Who"}</div>
            <p className="mt-3 text-[16px] leading-relaxed text-white/70">{ind.who}</p>
          </div>
          <div>
            <div className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-white/35`}>{home.industries?.howLabel ?? "How"}</div>
            <p className="mt-3 text-[16px] leading-relaxed text-white/70">{ind.how}</p>
          </div>
        </section>

        {/* Field capabilities (shared copy) */}
        {features.length > 0 && (
          <section className="border-t border-white/[0.08] px-6 py-16 sm:px-10">
            <div className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-white/35`}>{home.field?.label ?? "In the field"}</div>
            <div className="mt-8 grid gap-8 sm:grid-cols-2">
              {features.map((f, i) => (
                <div key={i}>
                  <h2 className={`${DISPLAY} text-[19px] leading-snug text-[#f2f2f0]`}>{f.title}</h2>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-white/55">{f.desc}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="border-t border-white/[0.08] px-6 py-20 sm:px-10">
          <p className={`${DISPLAY} max-w-[24ch] text-[clamp(1.6rem,4vw,2.8rem)] leading-[1.05] tracking-[-0.02em] text-[#f2f2f0]`}>
            {home.industries?.heading ?? "Built for field teams of every kind."}
          </p>
          <Link href="/register" className="mt-8 inline-block rounded-full bg-[#f2f2f0] px-6 py-3 text-[14px] font-semibold text-[#0e1116] transition-opacity hover:opacity-90">
            {home.cta?.requestDemo ?? "Start free trial"}
          </Link>
          {home.cta?.trialNote && <p className={`${MONO} mt-4 text-[11px] uppercase tracking-[0.18em] text-white/35`}>{home.cta.trialNote}</p>}
        </section>

        {/* Other industries — internal links */}
        <section className="border-t border-white/[0.08] px-6 py-16 sm:px-10">
          <div className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-white/35`}>{home.industries?.more ?? "More industries"}</div>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {others.map((s) => {
              const oi = INDUSTRY_SLUGS.indexOf(s);
              return (
                <li key={s}>
                  <Link href={industryPath(lang, s)} className="text-[16px] text-white/70 transition-colors hover:text-[#f2f2f0]">
                    {fields[oi]?.name ?? s} →
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Footer */}
        <footer className={`${MONO} border-t border-white/[0.08] px-6 py-10 text-[11px] text-white/35 sm:px-10`}>
          <Link href={homeHref} className="hover:text-white/60">HBCField</Link>
          <span className="mx-2">·</span>
          <Link href={hubHref} className="hover:text-white/60">{home.nav?.industries ?? "Industries"}</Link>
          <span className="mx-2">·</span>
          <Link href="/privacy" className="hover:text-white/60">Privacy</Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="hover:text-white/60">Terms</Link>
        </footer>
      </div>
    </main>
  );
}
