'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { explainerFor } from '@/lib/explainers/registry';
import { EXPLAINER_NS, ensureExplainers, explainersReady } from '@/i18n/explainers';
import { ExplainerDiagram } from './diagrams';

/**
 * The deep explanation of one module or option.
 *
 * Six sections, always in the same order: what it is, a picture, how it is
 * used, what you get, whether it fits, and the caveat that bites. A fixed shape
 * makes twenty-eight of these a filling-in job rather than twenty-eight
 * writing projects, and gives a reader the same map every time.
 *
 * Copy comes from the `explainers` namespace, which is fetched on demand —
 * this component never assumes it has arrived.
 */

export interface ExplainerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  explainerKey: string;
  title: string;
  scope: 'workspace' | 'organization';
  priceLabel?: string;
  enabled?: boolean;
}

/**
 * Reads a list out of the namespace. NOT a hook — it is called after an early
 * return, and a `use` prefix here would both trip rules-of-hooks and mislead.
 *
 * `returnObjects` hands back the key itself when the key is missing, so the
 * result is guarded rather than trusted — otherwise a half-translated language
 * renders the literal string "time_tracking.steps" as a bullet.
 */
function readList(t: ReturnType<typeof useTranslation>['t'], key: string): string[] {
  const value = t(key, { returnObjects: true, defaultValue: [] }) as unknown;
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

export function ExplainerDialog({
  open, onOpenChange, explainerKey, title, scope, priceLabel, enabled,
}: ExplainerDialogProps) {
  const { t: tc, i18n } = useTranslation();
  const { t } = useTranslation(EXPLAINER_NS);
  const [ready, setReady] = useState(() => explainersReady(i18n.language));
  const meta = explainerFor(explainerKey);

  useEffect(() => {
    if (ready) return;
    let alive = true;
    void ensureExplainers(i18n.language).then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [ready, i18n.language]);

  if (!meta) return null;

  const Icon = meta.icon;
  const k = (suffix: string) => `${explainerKey}.${suffix}`;

  const summary = t(k('summary'), { defaultValue: '' });
  const steps = readList(t, k('steps'));
  const benefits = readList(t, k('benefits'));
  const fitOn = t(k('fit.on'), { defaultValue: '' });
  const fitOff = t(k('fit.off'), { defaultValue: '' });
  const caveat = t(k('caveat'), { defaultValue: '' });
  const caption = t(k('caption'), { defaultValue: '' });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-4rem)] gap-0 overflow-hidden p-0 sm:max-w-[640px]">
        <DialogHeader className="flex-row items-start gap-3.5 space-y-0 border-b border-border px-5 py-4 text-left">
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-[17px] font-semibold tracking-tight">{title}</DialogTitle>
            <DialogDescription asChild>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  {scope === 'workspace'
                    ? tc('explainer.scope.workspace', 'Per workspace')
                    : tc('explainer.scope.organization', 'Whole organization')}
                </span>
                {priceLabel && (
                  <span className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                    {priceLabel}
                  </span>
                )}
                {enabled !== undefined && (
                  <span className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {enabled
                      ? tc('explainer.state.on', 'Currently on')
                      : tc('explainer.state.off', 'Currently off')}
                  </span>
                )}
              </div>
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto px-5 py-5">
          {!ready ? (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {tc('common.loading', 'Loading…')}
            </div>
          ) : (
            <div className="space-y-5">
              {summary && (
                <section>
                  <SectionLabel>{tc('explainer.whatItIs', 'What it is')}</SectionLabel>
                  <p className="text-sm leading-relaxed text-foreground/85">{summary}</p>
                </section>
              )}

              {meta.diagram && <ExplainerDiagram id={meta.diagram} caption={caption || undefined} />}

              {steps.length > 0 && (
                <section>
                  <SectionLabel>{tc('explainer.howToUse', 'How it is used')}</SectionLabel>
                  <ol className="space-y-2.5">
                    {steps.map((s, i) => (
                      <li key={i} className="flex gap-3 text-sm leading-relaxed text-foreground/85">
                        <span className="mt-0.5 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                          {i + 1}
                        </span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {benefits.length > 0 && (
                <section>
                  <SectionLabel>{tc('explainer.whatYouGet', 'What you get')}</SectionLabel>
                  <ul className="space-y-2">
                    {benefits.map((b, i) => (
                      <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-foreground/85">
                        <Check className="mt-[3px] h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {(fitOn || fitOff) && (
                <section>
                  <SectionLabel>{tc('explainer.isItForYou', 'Is it for you?')}</SectionLabel>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {fitOn && (
                      <FitCard heading={tc('explainer.fitOn', 'Turn it on when')}>{fitOn}</FitCard>
                    )}
                    {fitOff && (
                      <FitCard heading={tc('explainer.fitOff', 'You can leave it off when')}>
                        {fitOff}
                      </FitCard>
                    )}
                  </div>
                </section>
              )}

              {caveat && (
                <section className="rounded-r-lg border border-l-[3px] border-border border-l-primary bg-muted/30 px-4 py-3">
                  <SectionLabel className="mb-1">
                    {tc('explainer.goodToKnow', 'Good to know')}
                  </SectionLabel>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">{caveat}</p>
                </section>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h4
      className={`mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground ${className ?? ''}`}
    >
      {children}
    </h4>
  );
}

function FitCard({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3.5 py-3">
      <strong className="mb-1 block text-xs font-semibold text-foreground">{heading}</strong>
      <p className="text-[13px] leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
