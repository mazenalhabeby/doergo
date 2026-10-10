'use client';

import { useCallback, useEffect, useState } from 'react';
import { staffApi } from '@/lib/api/endpoints';
import { ROLES, type StaffUser } from '@/lib/api/types';
import { date } from '@/lib/format';
import { useAction } from '@/lib/hooks';

const EMPTY = { email: '', firstName: '', lastName: '', role: 'SUPPORT', password: '' };
const field = 'rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm';

/** Platform staff (Owner only). Your own row cannot change its role or switch itself off — the server refuses it too. */
export function StaffPanel({ meId, onError }: { meId: string; onError: (s: string) => void }) {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const { busy, run } = useAction(onError);
  const load = useCallback(async () => setStaff(await staffApi.list()), []);
  useEffect(() => { void run('load', load); }, [run, load]);

  return (
    <div className="rounded-xl border border-slate-800">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3"><h2 className="text-sm font-semibold">Team</h2><button onClick={() => setOpen((v) => !v)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-500">Add staff</button></div>
      {open && (
        <div className="grid grid-cols-2 gap-2 border-b border-slate-800 bg-slate-900/50 p-4 md:grid-cols-6">
          <input aria-label="Email" placeholder="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={field} />
          <input aria-label="First name" placeholder="first name" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} className={field} />
          <input aria-label="Last name" placeholder="last name" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} className={field} />
          <select aria-label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className={field}>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
          <input aria-label="Temporary password" placeholder="temp password (10+)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className={field} />
          <button disabled={busy === 'add'} onClick={() => run('add', async () => { await staffApi.create(f); setOpen(false); setF(EMPTY); }, load)} className="rounded bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-500">Create</button>
        </div>
      )}
      <div className="divide-y divide-slate-800">
        {staff.map((u) => {
          const self = u.id === meId;
          return (
            <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <span className={u.isActive ? 'font-medium' : 'font-medium text-slate-500 line-through'}>{u.firstName} {u.lastName}</span> <span className="text-xs text-slate-500">{u.email}</span>
                {self && <span className="ml-2 text-[10px] text-slate-500">(you)</span>}
                {!u.twoFactorEnabled && <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-400">no 2FA yet</span>}
              </div>
              <select aria-label={`Role of ${u.email}`} value={u.role} disabled={busy === u.id || self} title={self ? 'Another Owner must change your role' : undefined}
                onChange={(e) => run(u.id, () => staffApi.update(u.id, { role: e.target.value }), load)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs disabled:opacity-50">
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <span className="text-xs text-slate-500">{u.lastLoginAt ? `seen ${date(u.lastLoginAt)}` : 'never'}</span>
              {!self && u.twoFactorEnabled && (
                <button disabled={busy === u.id} onClick={() => window.confirm(`Clear ${u.email}'s authenticator? They will be signed out and must enrol a new one at their next sign-in.`) && run(u.id, () => staffApi.reset2fa(u.id), load)}
                  className="rounded bg-slate-800 px-2 py-1 text-[11px] hover:bg-slate-700">Reset 2FA</button>
              )}
              <button disabled={busy === u.id || self} onClick={() => run(u.id, () => staffApi.update(u.id, { isActive: !u.isActive }), load)} className={`rounded px-2 py-1 text-[11px] ${u.isActive ? 'bg-red-600/80 hover:bg-red-600' : 'bg-green-600/80 hover:bg-green-600'} disabled:opacity-40`}>{u.isActive ? 'Deactivate' : 'Reactivate'}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
