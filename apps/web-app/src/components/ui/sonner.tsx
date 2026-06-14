'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border/60 group-[.toaster]:shadow-xl group-[.toaster]:rounded-xl',
          title: 'group-[.toast]:text-sm group-[.toast]:font-medium group-[.toast]:text-foreground',
          description: 'group-[.toast]:text-xs group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-lg group-[.toast]:text-xs group-[.toast]:font-medium',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-lg group-[.toast]:text-xs',
          closeButton:
            'group-[.toast]:bg-card group-[.toast]:border-border/60 group-[.toast]:text-muted-foreground hover:group-[.toast]:text-foreground',
          error: 'group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-red-500/30',
          success: 'group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-green-500/30',
          warning: 'group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-amber-500/30',
          info: 'group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-blue-500/30',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
