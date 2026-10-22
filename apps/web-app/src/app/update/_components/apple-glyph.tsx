'use client';

/** Remembered separately from the app's own language key: a member may read this
 *  page on a borrowed phone, and that should not re-language their account. */
export const LANG_KEY = 'hbcfield_update_lang';

export type Platform = 'ios' | 'android' | 'desktop';

export function detectPlatform(): Platform {
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

export function AppleGlyph({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d={"M17.05 12.5c0-2.2 1.8-3.3 " +
          "1.9-3.35-1.04-1.5-2.65-1.72-3.22-1.74-1.37-.14-2.68.8-3.37.8-.7 " +
          "0-1.77-.79-2.9-.76-1.49.02-2.87.86-3.64 2.19-1.55 2.69-.4 6.67 1.11 " +
          "8.85.74 1.07 1.62 2.27 2.78 2.23 1.12-.05 1.54-.72 2.9-.72 1.34 0 " +
          "1.73.72 2.9.7 1.2-.02 1.96-1.09 2.7-2.16.85-1.24 1.2-2.44 " +
          "1.22-2.5-.03-.01-2.34-.9-2.36-3.55zM14.9 5.6c.62-.75 " +
          "1.03-1.79.92-2.83-.89.04-1.97.59-2.6 1.33-.57.66-1.07 1.72-.94 " +
          "2.73.99.08 2-.5 2.62-1.23z"}
      />
    </svg>
  );
}

export function PlayGlyph({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d={"M3.6 2.4a1 1 0 0 0-.35.76v17.68a1 1 0 0 0 .35.76l.1.06 " +
          "9.9-9.9v-.23l-9.9-9.9-.1.07zM17 15.3l-3.3-3.3 3.3-3.3 3.96 2.25c1.13.64 " +
          "1.13 1.76 0 2.4L17 15.3zM13.7 12l-9.9 9.9c.37.2.8.2 " +
          "1.2-.03l11.3-6.42L13.7 12zM5 2.13c-.4-.23-.83-.22-1.2-.03l9.9 9.9 " +
          "2.6-2.6L5 2.13z"}
      />
    </svg>
  );
}
