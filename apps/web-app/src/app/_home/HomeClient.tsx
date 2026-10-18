'use client';

import { useHomeClient } from './use-home-client';
import { HomeClientWhatItIs } from './home-client-what-it-is';

/* ═══════════════════════════════════════════════════════════
   Monochrome studio palette
   bg #0e1116 · text #d8d8d8 · emphasis #f2f2f0 · hairline white/8
   display: Familjen Grotesk (400) · labels: Martian Mono
   ═══════════════════════════════════════════════════════════ */

export default function HomeClient({ lang = 'en' }: { lang?: string }) {
  const vm = useHomeClient({ lang });

  return (
    <>
      <style>{`
        .reveal { opacity: 0; transform: translateY(20px); transition: opacity .8s cubic-bezier(.22,1,.36,1), transform .8s cubic-bezier(.22,1,.36,1); }
        .reveal.is-visible { opacity: 1; transform: none; }
        .lr-row { display: block; overflow: hidden; }
        .lr-in { display: block; transform: translateY(110%); transition: transform .95s cubic-bezier(.22,1,.36,1); }
        .lr.is-visible .lr-in { transform: translateY(0); }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        /* cycling word — each letter rises from behind a clip (trionn-style) */
        /* padding-bottom + equal negative margin extends the clip area below the
           baseline so descenders (g, y, p, q, j) aren't cut, without shifting layout */
        .cw-row { display: inline-block; overflow: hidden; vertical-align: bottom; padding-bottom: 0.2em; margin-bottom: -0.2em; }
        .cw-in { display: inline-block; transform: translateY(110%); animation: cw-rise .6s cubic-bezier(.22,1,.36,1) forwards; }
        @keyframes cw-rise { to { transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) {
          .reveal { opacity: 1; transform: none; transition: none; }
          .lr-in { transform: none; transition: none; }
          .cw-in { transform: none; animation: none; }
        }
      `}</style>
      <noscript><style>{`.reveal{opacity:1!important;transform:none!important}.lr-in{transform:none!important}`}</style></noscript>

      {/* Marketing content is ALWAYS rendered (server-side too) so crawlers and
          AI engines receive the full page — not a spinner. Authenticated users
          are redirected to /dashboard by the effect above, over the top. */}
      <HomeClientWhatItIs vm={vm} lang={lang} />
    </>
  );
}
