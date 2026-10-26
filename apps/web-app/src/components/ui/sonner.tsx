'use client';

import { useTheme } from 'next-themes';
import { Loader2 } from 'lucide-react';
import { Toaster as Sonner } from 'sonner';
import { Icon } from '@/components/ui/icon';

type ToasterProps = React.ComponentProps<typeof Sonner>;

/*
  The toast is the design board's pill (Home-Grid, 2026-10-26): it rises at the bottom CENTRE — where the eye
  already is — in the shell's jade, one line, an action on the right ("Undo"). Coral for an error, amber for a
  warning. Colours come from globals.css (`[data-sonner-toast]` by `data-type`), so both themes follow.
*/
const PILL =
  'pointer-events-auto flex w-full items-center gap-3 rounded-[26px] py-2 pl-2 pr-2.5 font-shell ' +
  'shadow-[0_20px_40px_-12px_rgba(0,0,0,.45)] min-h-[52px] ' +
  'bg-[image:var(--toast-bg)] text-[color:var(--toast-ink)]';
const DISC = 'grid size-9 shrink-0 place-items-center rounded-full bg-[color:var(--toast-disc)]';

const disc = (icon: React.ReactNode) => <span className={DISC}>{icon}</span>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      position="bottom-center"
      offset={28}
      gap={10}
      className="toaster group"
      icons={{
        success: disc(<Icon name="selected" size={20} />),
        info: disc(<Icon name="info" size={20} />),
        warning: disc(<Icon name="warning" size={20} />),
        error: disc(<Icon name="alert" size={20} />),
        loading: disc(<Loader2 className="size-4 animate-spin" />),
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: PILL,
          icon: 'contents',
          content: 'flex min-w-0 flex-1 flex-col py-1 pl-1.5',
          title: 'text-[14px] font-semibold leading-snug',
          description: 'text-[12.5px] font-medium leading-snug text-[color:var(--toast-ink)] opacity-80',
          actionButton:
            'h-[34px] shrink-0 rounded-full bg-white/20 px-3.5 text-[13px] font-bold transition-colors hover:bg-white/30',
          cancelButton: 'h-[34px] shrink-0 rounded-full px-3 text-[13px] font-semibold opacity-80 hover:opacity-100',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
