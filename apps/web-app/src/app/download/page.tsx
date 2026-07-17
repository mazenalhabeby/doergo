'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

// ─── Configuration ──────────────────────────────────────────────────────────────
// Driven by env so new builds can be swapped without a code change / redeploy.
// Set in apps/web-app/.env.local (or the prod env):
//   NEXT_PUBLIC_APP_VERSION       e.g. 1.0.0
//   NEXT_PUBLIC_ANDROID_APK_URL   EAS build URL, or /downloads/hbcfield.apk if self-hosted
//   NEXT_PUBLIC_TESTFLIGHT_URL    public TestFlight invite link
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0';
const ANDROID_APK_URL = process.env.NEXT_PUBLIC_ANDROID_APK_URL || '/downloads/hbcfield.apk';
const TESTFLIGHT_URL =
  process.env.NEXT_PUBLIC_TESTFLIGHT_URL || 'https://testflight.apple.com/join/XXXXXXXX';

// ─── Platform Detection ─────────────────────────────────────────────────────────
type Platform = 'android' | 'ios' | 'desktop';

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  return 'desktop';
}

// ─── Icons ───────────────────────────────────────────────────────────────────────
function AndroidIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24C14.86 8.32 13.47 8 12 8s-2.86.32-4.47.91L5.65 5.67c-.19-.29-.58-.38-.87-.2-.28.18-.37.54-.22.83L6.4 9.48C3.3 11.25 1.28 14.44 1 18h22c-.28-3.56-2.3-6.75-5.4-8.52zM7 15.25a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zm10 0a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z" />
    </svg>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}

// ─── Platform Card Components ────────────────────────────────────────────────────
function AndroidCard() {
  const { t } = useTranslation();
  return (
    <div className="bg-card rounded-2xl shadow-lg p-8">
      <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
        <AndroidIcon className="w-9 h-9 text-green-600" />
      </div>
      <h2 className="text-2xl font-semibold text-foreground mb-2">{t('download.android.title')}</h2>
      <p className="text-muted-foreground mb-6 text-sm">
        {t('download.android.description')}
      </p>
      <a
        href={ANDROID_APK_URL}
        className="inline-flex items-center gap-2 px-7 py-3.5 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all font-semibold shadow-md hover:shadow-lg active:scale-[0.98]"
      >
        <DownloadIcon className="w-5 h-5" />
        {t('download.android.button')}
      </a>
      <p className="text-xs text-muted-foreground mt-4">{t('download.android.meta', { version: APP_VERSION })}</p>
    </div>
  );
}

// iOS is ready only when a REAL public TestFlight link is configured — otherwise
// show a "coming soon" state instead of a dead placeholder link.
const IOS_READY = !!TESTFLIGHT_URL && !TESTFLIGHT_URL.includes('XXXXXXXX');

function IosCard() {
  const { t } = useTranslation();
  return (
    <div className="bg-card rounded-2xl shadow-lg p-8">
      <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-5">
        <AppleIcon className="w-9 h-9 text-foreground" />
      </div>
      <h2 className="text-2xl font-semibold text-foreground mb-2">{t('download.ios.title')}</h2>
      <p className="text-muted-foreground mb-6 text-sm">
        {t('download.ios.description')}
      </p>
      {IOS_READY ? (
        <a
          href={TESTFLIGHT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-7 py-3.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-semibold shadow-md hover:shadow-lg active:scale-[0.98]"
        >
          <ExternalLinkIcon className="w-5 h-5" />
          {t('download.ios.button')}
        </a>
      ) : (
        <span
          aria-disabled="true"
          className="inline-flex items-center gap-2 px-7 py-3.5 bg-muted text-muted-foreground rounded-xl font-semibold cursor-not-allowed select-none"
        >
          {t('download.ios.comingSoon', 'Coming soon on TestFlight')}
        </span>
      )}
      <p className="text-xs text-muted-foreground mt-4">{t('download.ios.meta', { version: APP_VERSION })}</p>
    </div>
  );
}

// ─── Instructions ────────────────────────────────────────────────────────────────
function AndroidInstructions() {
  const { t } = useTranslation();
  const steps = [
    t('download.androidStep1'),
    t('download.androidStep2'),
    t('download.androidStep3'),
    t('download.androidStep4'),
    t('download.androidStep5'),
  ];
  return <StepList steps={steps} />;
}

function IosInstructions() {
  const { t } = useTranslation();
  const steps = [
    t('download.iosStep1'),
    t('download.iosStep2'),
    t('download.iosStep3'),
    t('download.iosStep4'),
    t('download.iosStep5'),
  ];
  return <StepList steps={steps} />;
}

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="text-sm text-muted-foreground space-y-3">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3 items-start">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-50 text-blue-600 text-xs font-bold flex items-center justify-center mt-0.5">
            {i + 1}
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────────
export default function DownloadPage() {
  const { t } = useTranslation();
  const [platform, setPlatform] = useState<Platform>('desktop');
  const [activeTab, setActiveTab] = useState<'android' | 'ios'>('android');

  useEffect(() => {
    const detected = detectPlatform();
    setPlatform(detected);
    if (detected === 'ios') setActiveTab('ios');
  }, []);

  // On mobile, show only the relevant platform. On desktop, show tabs.
  const showTabs = platform === 'desktop';
  const showAndroid = platform === 'android' || (showTabs && activeTab === 'android');
  const showIos = platform === 'ios' || (showTabs && activeTab === 'ios');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gradient-to-b from-muted to-blue-50">
      <div className="text-center max-w-lg w-full">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-2 tracking-tight">
            HBC FIELD
          </h1>
          <p className="text-muted-foreground text-lg">{t('download.tagline')}</p>
        </div>

        {/* Platform switcher (desktop only) */}
        {showTabs && (
          <div className="flex bg-card rounded-xl shadow-sm p-1 mb-6 max-w-xs mx-auto">
            {(['android', 'ios'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'android' ? <AndroidIcon className="w-4 h-4" /> : <AppleIcon className="w-4 h-4" />}
                {tab === 'android' ? t('download.androidTab') : t('download.iosTab')}
              </button>
            ))}
          </div>
        )}

        {/* Download card */}
        {showAndroid && <AndroidCard />}
        {showIos && <IosCard />}

        {/* Installation instructions */}
        <div className="bg-card rounded-2xl shadow-sm p-6 text-left mt-6">
          <h3 className="font-semibold text-foreground mb-4">{t('download.howToInstall')}</h3>
          {showAndroid && <AndroidInstructions />}
          {showIos && <IosInstructions />}
        </div>

        {/* Desktop: show both options side by side below */}
        {showTabs && (
          <p className="text-xs text-muted-foreground mt-6">
            {t('download.desktopHint')}
          </p>
        )}

        {/* Back link */}
        <Link
          href="/"
          className="inline-block mt-6 text-sm text-muted-foreground hover:text-blue-600 transition-colors"
        >
          {t('download.backToPortal')}
        </Link>
      </div>
    </main>
  );
}
