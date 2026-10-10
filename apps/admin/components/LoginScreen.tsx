'use client';

import { useState } from 'react';
import { authApi } from '@/lib/api/endpoints';
import type { SessionResponse } from '@/lib/api/types';
import { useAction } from '@/lib/hooks';

const field = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:opacity-60';

export function LoginScreen({ onSession, notice }: { onSession: (s: SessionResponse) => void; notice?: string | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useAction(setError);

  const submit = () => {
    setError(null);
    void run('login', async () => {
      const r = await authApi.login({ email, password, code: code || undefined });
      if ('needs2fa' in r) { setNeeds2fa(true); return; }
      setPassword(''); setCode(''); setNeeds2fa(false);
      onSession(r);
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
      <form className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <h1 className="mb-1 text-lg font-semibold">Platform Control Center</h1>
        <p className="mb-4 text-sm text-slate-400">HBC staff sign-in.</p>
        {notice && <p className="mb-3 rounded border border-amber-900 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">{notice}</p>}
        <input aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" autoComplete="username" disabled={needs2fa} className={`mb-2 ${field}`} />
        <input aria-label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" autoComplete="current-password" disabled={needs2fa} className={`mb-3 ${field}`} />
        {needs2fa && (
          <input aria-label="Authenticator code" value={code} onChange={(e) => setCode(e.target.value.trim())} placeholder="6-digit authenticator code" inputMode="numeric" autoComplete="one-time-code" autoFocus
            className="mb-3 w-full rounded-lg border border-blue-700 bg-slate-950 px-3 py-2 text-center text-lg tracking-widest outline-none focus:border-blue-500" />
        )}
        <button type="submit" disabled={busy === 'login'} className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50">
          {busy === 'login' ? '…' : needs2fa ? 'Verify' : 'Sign in'}
        </button>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </form>
    </div>
  );
}
