'use client';

import { useState } from 'react';
import type { Me, SessionResponse } from '@/lib/api/types';
import { TwoFactorSetup } from './TwoFactorSetup';

/**
 * Shown when the SERVER says this session may only enrol a second factor
 * (`enrolmentRequired`). The console offers nothing else because the API
 * refuses everything else — this screen is the explanation, not the lock.
 */
export function EnrolmentScreen({ me, onSession, onSignOut }: { me: Me; onSession: (s: SessionResponse) => void; onSignOut: () => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div>
          <h1 className="text-lg font-semibold">Set up two-factor authentication</h1>
          <p className="mt-1 text-sm text-slate-400">
            Every operator account needs an authenticator app before it can use the console — it reaches every customer&apos;s data.
            Signed in as <span className="text-slate-200">{me.user.email}</span>.
          </p>
        </div>
        <TwoFactorSetup enabled={false} onSession={(s) => { setError(null); onSession(s); }} onError={setError} />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button onClick={onSignOut} className="text-xs text-slate-400 hover:text-slate-200">Sign out</button>
      </div>
    </div>
  );
}
