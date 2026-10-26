'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';
import i18n from 'i18next';
import { Toaster as Sonner, toast } from 'sonner';
import { Icon } from '@/components/ui/icon';

type ToasterProps = React.ComponentProps<typeof Sonner>;

/*
  The toast (toast board, 2026-10-26): the design's pill at the bottom CENTRE. It lands with a spring out of a
  soft blur, its icon tells the story (the tick draws itself, an error shakes), and a thin line along the bottom
  shows the time left and stops while the pointer is on it. Jade; coral for an error, amber for a warning, ink
  for news and for work in progress (a page being scanned). Every colour and motion is CSS in globals.css
  (`.toast-*`, keyed on Sonner's `data-type`), so both themes and reduced motion follow.
  ⚠️ Sonner owns the toast's ::before/::after (hover gaps) and its transform (stacking) — the sheen is a
  background layer and the entry blur is `filter`, so neither fights it.
*/
const PILL =
  'toast-pill pointer-events-auto flex w-full items-center gap-3 overflow-hidden rounded-[28px] py-2 pl-2 pr-2.5 ' +
  'font-shell min-h-[56px]';

/** Errors and warnings stay longer than good news — said once, here, for every call site. */
const LONGER: Array<['error' | 'warning' | 'info', number]> = [
  ['error', 8000],
  ['warning', 6000],
  ['info', 5000],
];
for (const [kind, duration] of LONGER) {
  const original = toast[kind];
  if ((original as { longer?: boolean }).longer) continue;
  const longer = ((message, data) => original(message, { duration, ...data })) as typeof original;
  (longer as { longer?: boolean }).longer = true;
  toast[kind] = longer;
}

const icon = (mark: React.ReactNode) => (
  <>
    <span className="toast-icon">{mark}</span>
    <span aria-hidden className="toast-life" />
  </>
);

/** Z undoes while a toast offers it; Esc closes the front one — never while typing. */
function useToastKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const front = document.querySelector<HTMLElement>('[data-sonner-toast][data-front="true"]');
      if (!front) return;
      if (e.key === 'Escape') front.querySelector<HTMLElement>('[data-close-button]')?.click();
      if (e.key === 'z' || e.key === 'Z') {
        const action = front.querySelector<HTMLElement>('[data-button]');
        if (action && action.textContent?.trim() === i18n.t('common.undo', 'Undo')) action.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();
  useToastKeys();

  return (
    <Sonner
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      position="bottom-center"
      offset={28}
      gap={10}
      closeButton
      className="toaster group"
      icons={{
        success: icon(<Icon name="checkLine" size={22} />),
        info: icon(<Icon name="info" size={22} />),
        warning: icon(<Icon name="warning" size={22} />),
        error: icon(<Icon name="alert" size={22} />),
        loading: (
          <>
            <span className="toast-scan">
              <Icon name="file" size={26} />
            </span>
            <span aria-hidden className="toast-sweep" />
          </>
        ),
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: PILL,
          icon: 'contents',
          content: 'flex min-w-0 flex-1 flex-col py-1 pl-1',
          title: 'text-[14.5px] font-semibold leading-snug',
          description: 'toast-description text-[12.5px] font-medium leading-snug',
          actionButton: 'toast-action h-[38px] shrink-0 rounded-full px-4 text-[13px] font-bold',
          cancelButton: 'h-[38px] shrink-0 rounded-full px-3 text-[13px] font-semibold opacity-80 hover:opacity-100',
          closeButton: 'toast-close',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
