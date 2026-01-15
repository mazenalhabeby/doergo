'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12',
};

/**
 * Consistent loading spinner component
 * Uses Lucide's Loader2 icon with spin animation
 */
export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <Loader2
      className={cn('animate-spin text-brand-600', sizeClasses[size], className)}
    />
  );
}

interface LoadingOverlayProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

/**
 * Full-screen or container loading overlay
 */
export function LoadingOverlay({ message, size = 'lg' }: LoadingOverlayProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] gap-3">
      <Spinner size={size} />
      {message && (
        <p className="text-sm text-slate-500 animate-pulse">{message}</p>
      )}
    </div>
  );
}

/**
 * Page-level loading component
 */
export function PageLoading() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Spinner size="xl" />
    </div>
  );
}
