'use client';

import { useState } from 'react';
import type { OrgDetail } from '@/lib/api/types';
import { orgsApi } from '@/lib/api/endpoints';
import { money, date } from '@/lib/format';

const exact = (c: number | null | undefined) => money(c, { exact: true });
const field = 'w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm outline-none focus:border-amber-500';

/**
 * The agreed price for one organization: read it, set it, remove it.
 *
 * The list price sits beside the agreed one wherever it is shown, because every
 * question an operator has here is about the DIFFERENCE. The form is a separate
 * state rather than always-open inputs: this changes what a real customer is
 * charged, and a live text box in a panel gets changed by somebody who meant to
 * read it.
 */
export function AgreedPrice({ org, busy, run, onError }: {
  org: OrgDetail;
  busy: boolean;
  run: (key: string, action: () => Promise<unknown>) => Promise<unknown>;
  onError: (s: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState('');
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');
  const agreed = org.agreedMonthlyCents;
  const list = org.listMonthlyCents;

  const open = () => {
    // Prefilled from the current deal, never from the LIST price — that would
    // invite somebody to press save on a number they did not choose.
    setAmount(agreed != null ? (agreed / 100).toFixed(2) : '');
    setUntil(org.agreedUntil ? String(org.agreedUntil).slice(0, 10) : '');
    setNote(org.agreedNote ?? '');
    setEditing(true);
  };

  const save = async () => {
    // Refused rather than rounded if it is not a number: Math.round(NaN) would
    // send 0 — a free customer created by a typo. The server validates again.
    const euros = Number(String(amount).replace(',', '.').trim());
    if (!Number.isFinite(euros) || euros < 0) { onError('Enter the agreed price in euros, for example 120 or 120.50.'); return; }
    await run(
      org.id,
      () => orgsApi.setAgreedPrice(org.id, { monthlyCents: Math.round(euros * 100), until: until || null, note: note.trim() || null }));
    setEditing(false);
  };

  const remove = () => {
    const ok = window.confirm(
      `Put ${org.name} back on the price list?\n\nThey pay ${exact(
        agreed)} a month today. Their usage comes to ${exact(list)}, and that is what they would be invoiced from the next cycle.`,
    );
    if (ok) void run(org.id, () => orgsApi.clearAgreedPrice(org.id));
  };

  if (editing) {
    return (
      <div className="mb-4 rounded-lg border border-amber-500/30 p-3">
        <div className="mb-2 text-xs text-slate-500">{agreed == null ? 'Agree a price' : 'Change the agreed price'} · {org.name}</div>
        <label className="mb-2 block">
          <span className="mb-1 block text-[10.5px] text-slate-500">Monthly amount in euros, excluding VAT</span>
          <input
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="120.00"
            inputMode="decimal"
            className={field}
          />
        </label>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[10.5px] text-slate-500">Until (optional)</span>
            <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={field} />
          </label>
          <div>
            <span className="mb-1 block text-[10.5px] text-slate-500">List price today</span>
            <div
              className={"rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-sm " +
                "text-slate-400 tabular-nums"}>{exact(list)}</div>
          </div>
        </div>
        <label className="mb-2 block">
          <span className="mb-1 block text-[10.5px] text-slate-500">Why (recorded with your name)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="Pilot rate agreed with…"
            className={field}
          />
        </label>
        <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
          They will be charged <b
            className="text-slate-200">{amount
              ? `€${amount}`
              : '—'}</b> a month instead of <b
                className="text-slate-200">{exact(list)}</b>, from their next invoice. Their access does not change.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button
            disabled={busy}
            onClick={save}
            className="rounded bg-amber-600/85 px-2.5 py-1 text-[11px] hover:bg-amber-600">{agreed == null ? 'Set price' : 'Save'}</button>
          <button
            disabled={busy}
            onClick={() => setEditing(false)}
            className={"rounded bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300 " + "hover:bg-slate-700"}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-lg border border-slate-800 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-xs text-slate-500">What they pay</span>
        <span
          className={`rounded px-1.5 py-0.5 text-[11px] ${agreed != null
            ? 'bg-amber-500/15 text-amber-400'
            : 'bg-blue-500/15 text-blue-400'}`}>{agreed != null ? 'Agreed price' : 'List price'}</span>
      </div>
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <b className="text-2xl font-semibold tabular-nums tracking-tight">{exact(agreed ?? list)}</b>
        <span className="text-xs text-slate-500">/ month</span>
        {agreed != null &&
          list != null &&
          list !== agreed &&
          <span className="text-xs text-slate-500 line-through tabular-nums">{exact(list)}</span>}
      </div>
      <p className="mb-2.5 text-[11px] leading-relaxed text-slate-500">
        {agreed != null ? (
          <>
            {org.agreedUntil ? <>Until <b className="text-slate-400">{date(org.agreedUntil)}</b> · </> : <>Open-ended · </>}
            set {org.agreedSetAt ? date(org.agreedSetAt) : 'unknown'}
            {org.agreedNote && <><br />“{org.agreedNote}”</>}
          </>
        ) : 'Charged the computed bill — it moves whenever their seats, workspaces or options do.'}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button
          disabled={busy}
          onClick={open}
          className={`rounded px-2.5 py-1 text-[11px] ${agreed != null
            ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            : 'bg-amber-600/85 hover:bg-amber-600'}`}>{agreed != null ? 'Edit' : 'Set an agreed price'}</button>
        {agreed != null &&
          <button
            disabled={busy}
            onClick={remove}
            className="rounded bg-red-600/80 px-2.5 py-1 text-[11px] hover:bg-red-600">Remove agreement</button>}
      </div>
    </div>
  );
}
