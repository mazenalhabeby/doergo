'use client';

import { useTranslation } from 'react-i18next';

// The app is live on both stores.
const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.hbcfield.app';
const APP_STORE_URL = 'https://apps.apple.com/app/id6762745260';

/** Official multi-colour Google Play triangle. */
function GooglePlayGlyph({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 512 512" aria-hidden="true">
      <path fill="#00D0FF" d="M47.6 24.3C42.9 29.2 40 36.9 40 46.9v418.2c0 10 2.9 17.7 7.6 22.6l1.4 1.4 234.3-234.3v-5.5L49 22.9l-1.4 1.4z" />
      <path fill="#FFCE00" d="M361.9 340.7l-78.6-78.7v-5.5l78.7-78.7 1.8 1L456.5 245c26.5 15.1 26.5 39.8 0 55l-92.8 52.7-1.8-2z" />
      <path fill="#FF3B44" d="M363.7 338.7L283.3 258.2 47.6 493.9c8.7 9.3 23.2 10.4 39.5 1.2l276.6-156.4z" />
      <path fill="#00D268" d="M363.7 173.5L87.1 17.2C70.8 7.9 56.3 9.1 47.6 18.4l235.7 235.7 80.4-80.6z" />
    </svg>
  );
}

/** Apple logo. */
function AppleGlyph({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

export function StoreBadges({ className = '', size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  const { t } = useTranslation();
  const sm = size === 'sm';

  const badge = `inline-flex items-center rounded-xl border border-white/15 bg-black text-white ${sm ? 'h-11 gap-2.5 px-3.5' : 'h-[54px] gap-3 px-4'}`;
  const glyph = sm ? 'shrink-0 h-[18px] w-[18px]' : 'shrink-0 h-6 w-6';
  const smallTxt = sm ? 'text-[8px]' : 'text-[10px]';
  const nameTxt = sm ? 'mt-0.5 text-[13px]' : 'mt-1 text-[17px]';

  return (
    <div className={`flex flex-wrap items-center ${sm ? 'gap-3' : 'gap-4'} ${className}`}>
      {/* Google Play — live */}
      <a
        href={GOOGLE_PLAY_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('home.field.getOnGooglePlay', 'Get it on Google Play')}
        className={`${badge} transition-transform duration-200 hover:-translate-y-0.5 hover:border-white/30`}
      >
        <GooglePlayGlyph className={glyph} />
        <span className="flex flex-col leading-none">
          <span className={`${smallTxt} font-medium uppercase tracking-[0.06em] text-white/75`}>
            {t('home.field.getItOn', 'Get it on')}
          </span>
          <span className={`${nameTxt} font-semibold leading-none`}>Google Play</span>
        </span>
      </a>

      {/* App Store — live */}
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('home.field.getOnAppStore', 'Download on the App Store')}
        className={`${badge} transition-transform duration-200 hover:-translate-y-0.5 hover:border-white/30`}
      >
        <AppleGlyph className={glyph} />
        <span className="flex flex-col leading-none">
          <span className={`${smallTxt} font-medium uppercase tracking-[0.06em] text-white/75`}>
            {t('home.field.downloadOnThe', 'Download on the')}
          </span>
          <span className={`${nameTxt} font-semibold leading-none`}>App Store</span>
        </span>
      </a>
    </div>
  );
}
