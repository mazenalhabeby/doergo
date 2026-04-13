'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function DownloadPage() {
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    setIsAndroid(/android/.test(ua));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gradient-to-b from-slate-50 to-blue-50">
      <div className="text-center max-w-lg">
        {/* Logo */}
        <div className="mb-8">
          <h1 className="text-5xl font-bold text-slate-800 mb-2">
            HBC FIELD
          </h1>
          <p className="text-slate-500 text-lg">Dispatch · Track · Deliver</p>
        </div>

        {/* Download Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
            </svg>
          </div>

          <h2 className="text-2xl font-semibold text-slate-800 mb-2">
            Download for Android
          </h2>
          <p className="text-slate-500 mb-6">
            Get the HBCField mobile app to manage tasks, track location, and submit reports on the go.
          </p>

          <a
            href="/downloads/hbcfield.apk"
            className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold text-lg shadow-md hover:shadow-lg"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download APK
          </a>

          <p className="text-xs text-slate-400 mt-4">
            Version 1.0.0 &middot; Android 6.0+
          </p>
        </div>

        {/* Install instructions */}
        <div className="bg-white rounded-2xl shadow-sm p-6 text-left">
          <h3 className="font-semibold text-slate-700 mb-3">Installation Steps</h3>
          <ol className="text-sm text-slate-500 space-y-2">
            <li className="flex gap-2">
              <span className="font-semibold text-blue-600 shrink-0">1.</span>
              Tap the download button above
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-blue-600 shrink-0">2.</span>
              Open the downloaded file
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-blue-600 shrink-0">3.</span>
              Allow &quot;Install from unknown sources&quot; if prompted
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-blue-600 shrink-0">4.</span>
              Follow the installation prompts
            </li>
          </ol>
        </div>

        {/* Back to portal link */}
        <Link
          href="/"
          className="inline-block mt-6 text-sm text-slate-400 hover:text-blue-600 transition-colors"
        >
          &larr; Back to Partner Portal
        </Link>
      </div>
    </main>
  );
}
