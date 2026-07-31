import Link from "next/link";
import { homeCopy, INDUSTRY_SLUGS, industryPath, localePath } from "@/lib/industries";

const DISPLAY = "font-[family:var(--font-familjen)]";
const MONO = "font-[family:var(--font-martian)]";

/** Hub page listing every industry HBCField serves, linking to each page. */
export function IndustriesHub({ lang }: { lang: string }) {
  const home = homeCopy(lang);
  const fields = home.industries?.fields ?? [];
  const homeHref = localePath(lang);

  return (
    <main className={`min-h-screen bg-[#0e1116] text-[#d8d8d8] ${DISPLAY}`}>
      <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-5 sm:px-10">
        <Link href={homeHref} className="text-[15px] font-semibold tracking-tight text-[#f2f2f0]">HBCField</Link>
        <Link href={`${homeHref}#pricing`} className={`${MONO} text-[11px] uppercase tracking-[0.2em] text-[#f2f2f0]`}>
          {home.cta?.requestDemo ?? "Start free trial"}
        </Link>
      </div>

      <div className="mx-auto max-w-[1100px]">
        <nav className={`${MONO} px-6 pt-10 text-[10px] uppercase tracking-[0.16em] text-white/35 sm:px-10`}>
          <Link href={homeHref} className="hover:text-white/70">HBCField</Link>
          <span className="mx-1.5">/</span>
          <span className="text-white/55">{home.nav?.industries ?? "Industries"}</span>
        </nav>

        <header className="px-6 pb-14 pt-8 sm:px-10 sm:pt-12">
          <h1 className={`${DISPLAY} text-[clamp(2rem,6vw,4rem)] font-normal leading-[1.03] tracking-[-0.02em] text-[#f2f2f0]`}>
            {home.industries?.heading ?? "Built for field teams of every kind."}
          </h1>
          <p className="mt-6 max-w-[60ch] text-[17px] leading-relaxed text-white/70">{home.industries?.lead}</p>
        </header>

        <section className="grid gap-px overflow-hidden border-y border-white/[0.08] bg-white/[0.08] sm:grid-cols-2">
          {INDUSTRY_SLUGS.map((slug, i) => {
            const f = fields[i];
            if (!f) return null;
            return (
              <Link key={slug} href={industryPath(lang, slug)} className="group bg-[#0e1116] p-8 transition-colors hover:bg-white/[0.03] sm:p-10">
                <h2 className={`${DISPLAY} text-[22px] leading-snug tracking-[-0.01em] text-[#f2f2f0]`}>{f.name}</h2>
                <p className="mt-3 text-[14.5px] leading-relaxed text-white/55">{f.benefit}</p>
                <span className={`${MONO} mt-5 inline-block text-[10px] uppercase tracking-[0.18em] text-white/40 transition-colors group-hover:text-[#f2f2f0]`}>
                  {home.nav?.industries ?? "Industries"} →
                </span>
              </Link>
            );
          })}
        </section>

        <footer className={`${MONO} px-6 py-10 text-[11px] text-white/35 sm:px-10`}>
          <Link href={homeHref} className="hover:text-white/60">HBCField</Link>
          <span className="mx-2">·</span>
          <Link href="/privacy" className="hover:text-white/60">Privacy</Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="hover:text-white/60">Terms</Link>
        </footer>
      </div>
    </main>
  );
}
