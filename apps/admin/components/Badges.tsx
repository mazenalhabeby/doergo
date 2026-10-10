import type { BillingMode } from '@/lib/api/types';

/**
 * How each organization pays, shown as a badge rather than a word. On the LIST
 * as well as the detail: "who is on invoice?" is a question about the whole
 * book, and answering it one organization at a time is how a contract customer
 * gets missed at renewal.
 */
export const BILLING_BADGE: Record<BillingMode, { label: string; cls: string; hint: string }> = {
  AUTOMATIC: { label: 'card', cls: 'bg-emerald-500/15 text-emerald-400', hint: 'Card on file, charged each month' },
  INVOICE: { label: 'invoice', cls: 'bg-blue-500/15 text-blue-400', hint: 'Stripe issues an invoice; paid by transfer' },
  EXTERNAL: { label: 'agreement', cls: 'bg-amber-500/15 text-amber-400', hint: 'Nothing charged — figures are list price only' },
};

export function BillingBadge({ mode }: { mode?: BillingMode | null }) {
  const b = BILLING_BADGE[mode ?? 'AUTOMATIC'];
  return <span title={b.hint} className={`rounded px-1.5 py-0.5 text-[11px] ${b.cls}`}>{b.label}</span>;
}

/*
  What each kind of billing alert is called, in one table — a fifth kind
  renders its own enum name rather than borrowing another kind's label.
*/
const ALERT_BADGE: Record<string, { label: string; cls: string }> = {
  DROP: { label: 'bill fell', cls: 'bg-amber-500/15 text-amber-400' },
  SYNC_FAILED: { label: 'sync failed', cls: 'bg-red-500/15 text-red-400' },
  CONTRACT_DRIFT: { label: 'outgrew deal', cls: 'bg-amber-500/15 text-amber-400' },
  CONTRACT_EXPIRING: { label: 'deal ending', cls: 'bg-blue-500/15 text-blue-400' },
};

export function AlertBadge({ kind }: { kind: string }) {
  const b = ALERT_BADGE[kind];
  return <span className={`rounded px-1.5 py-0.5 text-[11px] ${b?.cls ?? 'bg-slate-700'}`}>{b?.label ?? kind}</span>;
}

const STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-500/15 text-green-400', trialing: 'bg-blue-500/15 text-blue-400', past_due: 'bg-amber-500/15 text-amber-400',
  canceled: 'bg-slate-500/15 text-slate-400', incomplete: 'bg-red-500/15 text-red-400',
};

export function SubStatusPill({ status }: { status?: string | null }) {
  const s = (status ?? '').toLowerCase();
  return <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_COLOR[s] ?? 'bg-slate-700'}`}>{s}</span>;
}
