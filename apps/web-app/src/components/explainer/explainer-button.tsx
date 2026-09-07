'use client';

import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';
import { explainerFor } from '@/lib/explainers/registry';
import { ensureExplainers } from '@/i18n/explainers';
import { cn } from '@/lib/utils';

/**
 * The dialog, its eight diagrams and the copy loader are all behind this split:
 * a screen full of module rows costs one small button each until somebody asks
 * for detail.
 */
const ExplainerDialog = dynamic(
  () => import('./explainer-dialog').then((m) => m.ExplainerDialog),
  { ssr: false },
);

export interface ExplainerButtonProps {
  /** Module key or add-on key. */
  explainerKey: string;
  /** Shown in the header, and in the button's accessible name. */
  title: string;
  /** Per workspace, or once for the organization. */
  scope: 'workspace' | 'organization';
  priceLabel?: string;
  /** Whether it is currently switched on, for the header chip. */
  enabled?: boolean;
  className?: string;
}

/**
 * The "tell me more" affordance beside a module or option.
 *
 * ⚠️ THE CLICK MUST BE STOPPED HERE. In the workspace picker each row is a
 * `<label>` wrapping its checkbox, so a click anywhere inside it — this button
 * included — toggles the module. Without `preventDefault` the act of opening
 * the help switches the module on, and the symptom looks like anything but a
 * click-target bug.
 *
 * Renders nothing when the key has no explainer written yet. An `i` that opens
 * an empty dialog is worse than no `i` at all, and it means a newly added
 * module degrades quietly instead of shipping a broken control.
 */
export function ExplainerButton({
  explainerKey,
  title,
  scope,
  priceLabel,
  enabled,
  className,
}: ExplainerButtonProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const meta = explainerFor(explainerKey);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      // See the note above — load-bearing inside the <label> rows.
      e.preventDefault();
      e.stopPropagation();
      // Start the copy on its way before React mounts the dialog, so the two
      // happen together rather than one after the other.
      void ensureExplainers(i18n.language);
      setOpen(true);
    },
    [i18n.language],
  );

  if (!meta) return null;

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-label={t('explainerButton.aria', 'Learn more about {{name}}', { name: title })}
        className={cn(
          'inline-grid h-5 w-5 shrink-0 place-items-center rounded-full border border-border',
          'text-[11px] font-bold leading-none text-muted-foreground transition-colors',
          'hover:border-primary hover:bg-primary hover:text-primary-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          className,
        )}
      >
        i
      </button>

      {/* Mounted only once opened, so the chunk is fetched on demand. */}
      {open && (
        <ExplainerDialog
          open={open}
          onOpenChange={setOpen}
          explainerKey={explainerKey}
          title={title}
          scope={scope}
          priceLabel={priceLabel}
          enabled={enabled}
        />
      )}
    </>
  );
}
