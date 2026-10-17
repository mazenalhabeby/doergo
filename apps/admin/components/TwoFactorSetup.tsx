'use client';

import { useState } from 'react';
import { authApi } from '@/lib/api/endpoints';
import type { SessionResponse } from '@/lib/api/types';
import { useAction } from '@/lib/hooks';

const input = 'w-32 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-center text-sm tracking-widest';

/**
 * Enrol, replace or remove the authenticator.
 *
 * The server holds a new secret as PENDING until a code from it is confirmed,
 * and asks for a CURRENT code before replacing or removing one in force — so
 * this screen can never leave an account with weaker protection than it had.
 * Every step returns a fresh session (other sessions end); `onSession` stores it.
 */
export function TwoFactorSetup({ enabled, onSession, onError }: {
  enabled: boolean;
  onSession: (s: SessionResponse) => void;
  onError: (m: string) => void;
}) {
  const { busy, run } = useAction(onError);
  const [pending, setPending] = useState<{ secret: string; qr: string } | null>(null);
  const [current, setCurrent] = useState('');
  const [code, setCode] = useState('');

  const start = () => run('setup', async () => {
    const r = await authApi.setup2fa(enabled ? current : undefined);
    onSession(r);
    const QR = (await import('qrcode')).default;
    setPending({ secret: r.secret, qr: await QR.toDataURL(r.otpauthUri, { margin: 1, width: 200 }) });
    setCurrent('');
  });
  const confirm = () => run('enable', async () => {
    onSession(await authApi.enable2fa(code));
    setPending(null);
    setCode('');
  });
  const disable = () => run('disable', async () => {
    onSession(await authApi.disable2fa(current));
    setCurrent('');
  });

  if (pending) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-slate-400">Scan with your authenticator app, then enter the 6-digit code it shows.</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pending.qr} alt="Authenticator QR code" className="rounded bg-white p-1" width={180} height={180} />
        <p className="break-all font-mono text-[11px] text-slate-500">secret: {pending.secret}</p>
        <div className="flex items-center gap-2">
          <input aria-label="Authenticator code" placeholder="6-digit code" inputMode="numeric" autoComplete="one-time-code" value={code}
            onChange={(e) => setCode(e.target.value.trim())}
              onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && confirm()}
              className={input}
            />
          <button
            disabled={busy === 'enable' || code.length !== 6}
            onClick={confirm}
            className={"rounded-lg bg-green-600 px-3 py-1.5 text-sm hover:bg-green-500 " + "disabled:opacity-40"}>Confirm</button>
        </div>
        {enabled && <p className="text-[11px] text-slate-500">Your current authenticator keeps working until this one is confirmed.</p>}
      </div>
    );
  }

  if (enabled) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-slate-500">Enter a current code to replace or remove your authenticator.</p>
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="Current code" placeholder="current code" inputMode="numeric" autoComplete="one-time-code" value={current}
            onChange={(e) => setCurrent(e.target.value.trim())} className={input} />
          <button
            disabled={busy === 'setup' || current.length !== 6}
            onClick={start}
            className={"rounded-lg bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600 " + "disabled:opacity-40"}>Replace</button>
          <button
            disabled={busy === 'disable' || current.length !== 6}
            onClick={disable}
            className={"rounded-lg bg-red-600/80 px-3 py-1.5 text-sm hover:bg-red-600 " + "disabled:opacity-40"}>Remove</button>
        </div>
        <p
          className="text-[11px] text-slate-500">A second factor is required for every operator: without one, the console offers only this screen.</p>
      </div>
    );
  }

  return <button
    disabled={busy === 'setup'}
    onClick={start}
    className={"rounded-lg bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-500 " + "disabled:opacity-40"}>Set up an authenticator</button>;
}
