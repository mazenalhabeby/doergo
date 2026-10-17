import type { MailStatus } from '@/lib/api/types';

/*
  Outbound mail health, on every tab. Two states worth showing, not one:
  everything down is an outage, but a working fallback with a dead primary is
  the state that otherwise hides for months — mail arrives, so nobody looks.
*/
export function MailBanner({ mail }: { mail: MailStatus | null }) {
  if (!mail) return null;
  if (!mail.ok) {
    return (
      <div className="mb-4 rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm">
        <div
          className="font-semibold text-red-300">Outbound email is not working — no password reset, invitation or notification is being delivered.</div>
        <div className="mt-1 space-y-0.5 text-xs text-red-200/70">
          {mail.configured
            ? (mail.routes?.length
                ? mail.routes.map((r) => <div key={r.label}>{r.label}:{r.port} — {r.error}</div>)
                : <div>{mail.host}:{mail.port} — {mail.error}</div>)
            : <div>SMTP is not configured on this deployment.</div>}
        </div>
      </div>
    );
  }
  if (mail.routes?.some((r) => !r.ok)) {
    return (
      <div className="mb-4 rounded-lg border border-amber-900 bg-amber-950/30 px-4 py-3 text-sm">
        <div className="font-semibold text-amber-300">Email is being delivered by a fallback — one provider is down.</div>
        <div className="mt-1 space-y-0.5 text-xs text-amber-200/70">
          {mail.routes.map((r) => <div key={r.label}>{r.ok ? '✓' : '✗'} {r.label}:{r.port}{r.ok ? '' : ` — ${r.error}`}</div>)}
        </div>
      </div>
    );
  }
  return null;
}
