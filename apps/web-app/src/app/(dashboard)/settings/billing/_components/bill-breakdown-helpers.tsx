"use client";

import { useTranslation } from "react-i18next";
import { formatCents } from "@hbcfield/shared/client";
import { cn } from "@/lib/utils";

/** BillBreakdown's module-level helpers, moved here unchanged so its sections can read them too. */
// ── pieces ────────────────────────────────────────────────────────────────

/**
 * A heading that states what it is priced BY.
 *
 * Three things are billed three different ways — per person, per workspace,
 * once for the organization — and that is the single hardest thing to see on
 * this page. Explaining it in a sentence underneath worked only for people who
 * read the sentence. Saying it beside every heading means the model can be read
 * off the page without reading anything: three sections, three scopes.
 */
export function SectionHead({ title, scope, aside }: { title: string; scope: string; aside: string }) {
  return (
    <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <span className="flex items-baseline gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {scope}
        </span>
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">{aside}</span>
    </div>
  );
}

export function Legend({ colour, label, cents }: { colour: string; label: string; cents: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-sm', colour)} />
      {label} <b className="font-semibold tabular-nums text-foreground">{formatCents(cents)}</b>
    </span>
  );
}

export function Tile({
  icon,
  label,
  cents,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  cents: number;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-1.5 text-lg font-semibold tabular-nums tracking-tight text-foreground">{formatCents(cents)}</p>
      <p className="text-[11px] tabular-nums text-muted-foreground">{detail}</p>
    </div>
  );
}

export function PersonRow({
  label,
  tag,
  tagCls,
  count,
  each,
  cents,
}: {
  label: string;
  tag?: string;
  tagCls?: string;
  count: number;
  each: number;
  cents: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
        <span className="truncate">{label}</span>
        {tag && <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold', tagCls)}>{tag}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-4">
        <span className="text-xs tabular-nums text-muted-foreground">
          {t('billing.bill.seatsDetail', '{{count}} × {{price}}', { count, price: formatCents(each) })}
        </span>
        <span className="min-w-[4.5rem] text-right text-sm font-semibold tabular-nums text-foreground">
          {formatCents(cents)}
        </span>
      </span>
    </div>
  );
}
