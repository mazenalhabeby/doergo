'use client';

import { useState } from 'react';
import { authApi } from '@/lib/api/endpoints';
import type { Me, SessionResponse } from '@/lib/api/types';
import { useAction } from '@/lib/hooks';
import { TwoFactorSetup } from './TwoFactorSetup';

export function SecurityModal({ me, onClose, onError, onSession, onNotice }: {
  me: Me;
  onClose: () => void;
  onError: (m: string) => void;
  onSession: (s: SessionResponse) => void;
  onNotice: (m: string) => void;
}) {
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const { busy, run } = useAction(onError);
  const changePw = () => run('pw', async () => {
    onSession(await authApi.changePassword(cur, nw));
    setCur(''); setNw('');
    onNotice('Password changed — other sessions were signed out.');
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div role="dialog" aria-label="Security" className="w-full max-w-md space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Security · {me.user.email}</h2><button onClick={onClose} aria-label="Close" className="text-slate-400">✕</button></div>
        <div>
          <div className="mb-2 text-sm font-semibold text-slate-300">Change password</div>
          <input type="password" aria-label="Current password" placeholder="current password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" className="mb-2 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
          <input type="password" aria-label="New password" placeholder="new password (10+ chars)" value={nw} onChange={(e) => setNw(e.target.value)} autoComplete="new-password" className="mb-2 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
          <button disabled={busy === 'pw' || !cur || nw.length < 10} onClick={changePw} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-500 disabled:opacity-40">Update password</button>
        </div>
        <div className="border-t border-slate-800 pt-4">
          <div className="mb-2 text-sm font-semibold text-slate-300">
            Two-factor authentication {me.user.twoFactorEnabled ? <span className="text-green-400">· ON</span> : <span className="text-slate-500">· off</span>}
          </div>
          <TwoFactorSetup enabled={!!me.user.twoFactorEnabled} onSession={onSession} onError={onError} />
        </div>
      </div>
    </div>
  );
}
