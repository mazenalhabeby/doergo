'use client';

import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
          error:
            'group-[.toaster]:bg-error-light group-[.toaster]:text-error group-[.toaster]:border-error-border',
          success:
            'group-[.toaster]:bg-success-light group-[.toaster]:text-success group-[.toaster]:border-success-border',
          warning:
            'group-[.toaster]:bg-warning-light group-[.toaster]:text-warning group-[.toaster]:border-warning-border',
          info:
            'group-[.toaster]:bg-info-light group-[.toaster]:text-info group-[.toaster]:border-info-border',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
