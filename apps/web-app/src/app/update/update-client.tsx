'use client';

/**
 * The update page, as the phone sees it.
 *
 * ⚠️ WHY A WEB PAGE AT ALL, when the app already has three update surfaces
 * (`update-required`, `update-page`, `update-banner`): all three ship INSIDE
 * the app, so none of them can reach somebody whose build predates them. The
 * members furthest behind are exactly the ones the in-app prompt cannot talk
 * to. A link sent by SMS or WhatsApp is the only channel that does not depend
 * on the thing being updated — and it also reaches a member who has not
 * installed the app at all.
 *
 * ⚠️ CLIENT-SIDE ON PURPOSE. Which store to offer depends on the device, and a
 * server render would have to guess from a User-Agent header before hydration —
 * showing the wrong button for a beat on the one screen whose whole job is a
 * single correct button.
 */

import { useEffect, useState } from 'react';
import { APP_STORE_URL, GOOGLE_PLAY_URL } from '@/lib/store-links';
import { isSupported, supportedLanguages, type Supported } from '@/i18n/languages';
import { UPDATE_COPY } from './copy';

/** Remembered separately from the app's own language key: a member may read this
 *  page on a borrowed phone, and that should not re-language their account. */
const LANG_KEY = 'hbcfield_update_lang';

type Platform = 'ios' | 'android' | 'desktop';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  /*
    ⚠️ The second test is not redundant. iPadOS 13+ reports itself as
    "Macintosh", so an iPad without it is offered Google Play. Touch support is
    what separates an iPad from a Mac in that string.
  */
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document) {
    return 'ios';
  }
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

function AppleGlyph({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 12.5c0-2.2 1.8-3.3 1.9-3.35-1.04-1.5-2.65-1.72-3.22-1.74-1.37-.14-2.68.8-3.37.8-.7 0-1.77-.79-2.9-.76-1.49.02-2.87.86-3.64 2.19-1.55 2.69-.4 6.67 1.11 8.85.74 1.07 1.62 2.27 2.78 2.23 1.12-.05 1.54-.72 2.9-.72 1.34 0 1.73.72 2.9.7 1.2-.02 1.96-1.09 2.7-2.16.85-1.24 1.2-2.44 1.22-2.5-.03-.01-2.34-.9-2.36-3.55zM14.9 5.6c.62-.75 1.03-1.79.92-2.83-.89.04-1.97.59-2.6 1.33-.57.66-1.07 1.72-.94 2.73.99.08 2-.5 2.62-1.23z" />
    </svg>
  );
}

function PlayGlyph({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3.6 2.4a1 1 0 0 0-.35.76v17.68a1 1 0 0 0 .35.76l.1.06 9.9-9.9v-.23l-9.9-9.9-.1.07zM17 15.3l-3.3-3.3 3.3-3.3 3.96 2.25c1.13.64 1.13 1.76 0 2.4L17 15.3zM13.7 12l-9.9 9.9c.37.2.8.2 1.2-.03l11.3-6.42L13.7 12zM5 2.13c-.4-.23-.83-.22-1.2-.03l9.9 9.9 2.6-2.6L5 2.13z" />
    </svg>
  );
}

export default function UpdateClient({ latest }: { latest: string }) {
  /*
    ⚠️ Both start at a fixed value and are corrected in an effect, rather than
    read during render. Reading navigator while rendering makes the server and
    the first client pass disagree, which React reports as a hydration error and
    which flickers the button on a slow phone.
  */
  const [lang, setLang] = useState<Supported>('en');
  const [platform, setPlatform] = useState<Platform>('desktop');
  const [yours, setYours] = useState<string | null>(null);

  useEffect(() => {
    setPlatform(detectPlatform());

    let chosen: Supported | null = null;
    try {
      const saved = window.localStorage.getItem(LANG_KEY);
      if (saved && isSupported(saved)) chosen = saved;
    } catch {
      // Private mode, or site data blocked. The browser's language still works.
    }
    if (!chosen) {
      const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
      if (isSupported(nav)) chosen = nav;
    }
    if (chosen) setLang(chosen);

    /*
      `?v=1.0.3` lets a message sent to one person name the version they are on.
      A browser cannot ask the app, so without it the chip stays vague — which is
      honest, and better than inventing a number.
      ⚠️ Shape-checked before it is rendered: it arrives from a URL, which is to
      say from anywhere.
    */
    const v = new URLSearchParams(window.location.search).get('v');
    if (v && /^\d+\.\d+\.\d+$/.test(v)) setYours(v);
  }, []);

  const t = UPDATE_COPY[lang];

  const target =
    platform === 'ios' ? APP_STORE_URL : GOOGLE_PLAY_URL;
  const ctaLabel =
    platform === 'ios' ? t.ctaIos : platform === 'android' ? t.ctaAndroid : t.ctaDesktop;
  const ctaNote =
    platform === 'ios' ? t.noteIos : platform === 'android' ? t.noteAndroid : t.noteDesktop;

  const pick = (code: Supported) => {
    setLang(code);
    try {
      window.localStorage.setItem(LANG_KEY, code);
    } catch {
      // Not remembering the choice is survivable; failing to switch is not.
    }
  };

  return (
    <div className="min-h-screen bg-[#0A1018] text-slate-100 [color-scheme:dark]">
      <div
        className="min-h-screen bg-no-repeat"
        style={{
          backgroundImage:
            'radial-gradient(900px 500px at 50% -10%, rgba(37,99,235,.20), transparent 62%), radial-gradient(700px 420px at 12% 8%, rgba(22,163,74,.13), transparent 60%)',
        }}
      >
        <div className="mx-auto max-w-[520px] px-5 pb-16 pt-8">
          {/* brand */}
          <div className="mb-9 flex items-center justify-center gap-3">
            <svg viewBox="0 0 48 48" className="h-8 w-8" aria-hidden="true">
              <path d="M24 4 L44 24 L24 20 Z" fill="#34D399" />
              <path d="M24 4 L24 20 L6 24 Z" fill="#6EE7B7" opacity=".75" />
              <path d="M44 24 L24 44 L24 28 Z" fill="#2563EB" />
              <path d="M6 24 L24 28 L24 44 Z" fill="#C7D2FE" opacity=".85" />
            </svg>
            <span className="text-[19px] font-extrabold tracking-[0.055em]">
              HBC<span className="font-normal text-slate-400">FIELD</span>
            </span>
          </div>

          <h1 className="mb-3.5 text-center text-[clamp(30px,8.5vw,40px)] font-extrabold leading-[1.1] tracking-[-0.022em] text-balance">
            {t.title}
          </h1>
          <p className="mx-auto mb-7 max-w-[40ch] text-center text-[16.5px] leading-[1.62] text-slate-400">
            {t.lede}
          </p>

          {/* version chips */}
          <div className="mb-7 flex items-stretch gap-2.5">
            <div className="flex-1 rounded-[13px] border border-[#25344A] bg-[#141E2E] px-3.5 py-3 text-center">
              <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                {t.yours}
              </span>
              <span className="text-[19px] font-bold tabular-nums text-slate-400">
                {yours ?? t.yoursUnknown}
              </span>
            </div>
            <div className="flex items-center text-[17px] text-slate-500" aria-hidden="true">
              →
            </div>
            <div className="flex-1 rounded-[13px] border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-3 text-center">
              <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.12em] text-emerald-400">
                {t.latest}
              </span>
              <span className="text-[19px] font-bold tabular-nums">{latest}</span>
            </div>
          </div>

          {/* the one button */}
          <a
            href={target}
            className="flex w-full items-center justify-center gap-3 rounded-[15px] bg-gradient-to-r from-green-600 to-blue-600 px-5 py-[19px] text-[17.5px] font-bold text-white shadow-[0_18px_50px_rgba(0,0,0,.45)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-blue-400"
          >
            {platform === 'ios' ? (
              <AppleGlyph className="h-[22px] w-[22px] shrink-0" />
            ) : (
              <PlayGlyph className="h-[22px] w-[22px] shrink-0" />
            )}
            <span>{ctaLabel}</span>
          </a>
          <p className="mt-3 text-center text-[13.5px] leading-[1.55] text-slate-500">{ctaNote}</p>

          {/* steps */}
          <h2 className="mb-3.5 mt-10 text-[12px] font-bold uppercase tracking-[0.13em] text-slate-500">
            {t.stepsHeading}
          </h2>
          <ol className="flex flex-col">
            {[
              <>{t.step1}</>,
              <>
                <em className="not-italic text-slate-100">{t.step2Emphasis}</em> {t.step2}
              </>,
              <>{t.step3}</>,
            ].map((body, i) => (
              <li
                key={i}
                className={`flex items-start gap-3.5 py-2.5 ${i > 0 ? 'border-t border-[#25344A]' : ''}`}
              >
                <span className="mt-px grid h-[25px] w-[25px] shrink-0 place-items-center rounded-full border border-[#25344A] bg-[#1B2739] text-[12.5px] font-bold tabular-nums text-slate-400">
                  {i + 1}
                </span>
                <p className="m-0 text-[15.5px] leading-[1.55] text-slate-300">{body}</p>
              </li>
            ))}
          </ol>

          {/* the reassurance that actually matters to a field member */}
          <div className="mt-7 flex items-start gap-3 rounded-xl border border-[#25344A] border-l-[3px] border-l-emerald-500 bg-[#141E2E] px-4 py-3.5">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-px h-[19px] w-[19px] shrink-0 text-emerald-500"
              aria-hidden="true"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            <p className="m-0 text-[14.5px] leading-[1.6] text-slate-400">
              {t.safeLead}{' '}
              <strong className="font-semibold text-slate-100">{t.safeStrong}</strong> {t.safeTail}
            </p>
          </div>

          {/* what changed */}
          <h2 className="mb-3.5 mt-10 text-[12px] font-bold uppercase tracking-[0.13em] text-slate-500">
            {t.newHeading}
          </h2>
          <div className="flex flex-col gap-3">
            {[
              [t.new1Strong, t.new1],
              [t.new2Strong, t.new2],
              [t.new3Strong, t.new3],
            ].map(([strong, rest]) => (
              <div key={strong} className="flex items-start gap-3">
                <span className="mt-[7px] h-[7px] w-[7px] shrink-0 rounded-full bg-gradient-to-br from-emerald-400 to-blue-400" />
                <p className="m-0 text-[15px] leading-[1.58] text-slate-400">
                  <b className="font-semibold text-slate-100">{strong}</b> {rest}
                </p>
              </div>
            ))}
          </div>

          {/* fallback for the other phone */}
          <div className="mt-9 border-t border-[#25344A] pt-5">
            <p className="mb-3 text-center text-[13.5px] text-slate-500">{t.otherPhone}</p>
            <div className="flex gap-2.5">
              <a
                href={APP_STORE_URL}
                className="flex flex-1 items-center justify-center gap-2 rounded-[11px] border border-[#25344A] bg-[#141E2E] px-2.5 py-3 text-sm font-semibold text-slate-400 transition hover:border-blue-600 hover:text-slate-100"
              >
                <AppleGlyph className="h-4 w-4 shrink-0" />
                {t.iphone}
              </a>
              <a
                href={GOOGLE_PLAY_URL}
                className="flex flex-1 items-center justify-center gap-2 rounded-[11px] border border-[#25344A] bg-[#141E2E] px-2.5 py-3 text-sm font-semibold text-slate-400 transition hover:border-blue-600 hover:text-slate-100"
              >
                <PlayGlyph className="h-4 w-4 shrink-0" />
                {t.android}
              </a>
            </div>
          </div>

          <p className="mt-6 text-center text-[13.5px] leading-[1.65] text-slate-500">
            {t.helpLead}{' '}
            <a
              href="mailto:support@hbcfield.com"
              className="font-semibold text-blue-400 hover:underline"
            >
              {t.helpLink}
            </a>
          </p>

          {/* language */}
          <div className="mt-8 flex flex-wrap justify-center gap-1.5 border-t border-[#25344A] pt-5">
            {supportedLanguages.map(({ code, label }) => (
              <button
                key={code}
                type="button"
                onClick={() => pick(code as Supported)}
                aria-current={code === lang ? 'true' : undefined}
                className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition ${
                  code === lang
                    ? 'border-blue-600 bg-[#1B2739] text-slate-100'
                    : 'border-[#25344A] text-slate-500 hover:border-slate-400 hover:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
