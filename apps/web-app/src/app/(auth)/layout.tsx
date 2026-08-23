import { MobileAppInterstitial } from '@/components/mobile-app-interstitial';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    /*
      `force-light` pins the light token set for this whole scope.

      The cards below hard-code `bg-white` but their inputs read `--input`,
      which under a dark OS resolved to near-black — a white card with black
      borders. The login page already carried this class; the layout did not,
      so every other auth screen inherited the mismatch.
    */
    <div className="force-light min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 text-slate-900 flex items-center justify-center p-4 sm:p-8">
      {children}
      {/* Phone users landing on login/register get nudged to the native app. */}
      <MobileAppInterstitial />
    </div>
  );
}
