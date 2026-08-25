'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import {
  AVAILABLE_ADD_ONS,
  addOnsMonthlyCost,
  addOnI18n,
  formatCents,
  type AddOnDef,
} from '@hbcfield/shared/client';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

const GROUP_ORDER: AddOnDef['group'][] = ['work', 'money', 'insight', 'support'];

/**
 * Buying capabilities.
 *
 * These used to arrive in a bundle: pick Business, get eleven things, four of
 * which you never open. Now each is its own decision with its own price, which
 * is fairer and also more honest — a feature that cannot justify a line on an
 * invoice was never really worth what the bundle implied.
 *
 * Nothing is saved as you toggle. The switches build a proposed list, the change
 * to the monthly total is shown while you decide, and one Save sends the whole
 * list. Per-toggle saving would mean a Stripe proration for every click and no
 * moment where somebody sees the cost of what they are about to do.
 */
export function AddOnPicker({
  purchased,
  disabled,
  onSave,
}: {
  purchased: string[];
  /** Non-admins see the list and the prices, and cannot change them. */
  disabled?: boolean;
  onSave: (keys: string[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>(purchased);
  const [saving, setSaving] = useState(false);

  // Compare as sets, not as arrays: order is not a change, and the server
  // returns them sorted while a click appends.
  const dirty = useMemo(() => {
    const a = new Set(purchased);
    const b = new Set(selected);
    return a.size !== b.size || [...a].some((k) => !b.has(k));
  }, [purchased, selected]);

  const current = addOnsMonthlyCost(purchased).monthlyCents;
  const proposed = addOnsMonthlyCost(selected).monthlyCents;
  const delta = proposed - current;

  const toggle = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const save = async () => {
    setSaving(true);
    try {
      await onSave(selected);
    } finally {
      setSaving(false);
    }
  };

  const label = (a: AddOnDef) => t(addOnI18n.label(a.key), { defaultValue: a.label });
  const description = (a: AddOnDef) => t(addOnI18n.description(a.key), { defaultValue: a.description });

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{t('billing.addOns.title', 'Add-ons')}</p>
          <p className="text-xs text-muted-foreground">
            {t('billing.addOns.subtitle', 'Bought once for the whole organization, not per workspace')}
          </p>
        </div>

        {/* The cost of the decision, while it is still a decision. */}
        {dirty && (
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'text-sm font-semibold tabular-nums',
                delta > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400',
              )}
            >
              {delta > 0 ? '+' : ''}
              {formatCents(delta)}
              {t('billing.addOns.perMonth', '/mo')}
            </span>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {t('common.save', 'Save')}
            </Button>
          </div>
        )}
      </div>

      <div className="divide-y divide-border">
        {GROUP_ORDER.map((group) => {
          const items = AVAILABLE_ADD_ONS.filter((a) => a.group === group);
          if (!items.length) return null;
          return (
            <div key={group} className="px-5 py-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t(addOnI18n.groupLabel(group), { defaultValue: group })}
              </p>
              <ul className="space-y-2.5">
                {items.map((a) => {
                  const on = selected.includes(a.key);
                  return (
                    <li key={a.key} className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                          {label(a)}
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                            {formatCents(a.monthlyCents)}
                            {t('billing.addOns.perMonth', '/mo')}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">{description(a)}</p>
                      </div>
                      <Switch
                        checked={on}
                        onCheckedChange={() => toggle(a.key)}
                        disabled={disabled || saving}
                        aria-label={label(a)}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
