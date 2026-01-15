'use client';

import { Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';

interface AnimatedLogoProps {
  className?: string;
  size?: 'small' | 'default';
}

export function AnimatedLogo({ className, size = 'default' }: AnimatedLogoProps) {
  const sizeClasses = size === 'small' ? 'w-10 h-10' : 'w-12 h-12';
  const textSize = size === 'small' ? 'text-xl' : 'text-2xl';
  const sparkleSize = size === 'small' ? 'w-3 h-3' : 'w-4 h-4';

  return (
    <div className={cn('relative group', className)}>
      <div className="absolute inset-0 bg-gradient-to-br from-accent-400 to-accent-600 rounded-xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity duration-500 animate-pulse-slow" />
      <div
        className={cn(
          'relative rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform duration-300',
          sizeClasses
        )}
      >
        <span className={cn('font-bold text-white', textSize)}>D</span>
        <Sparkles
          className={cn(
            'absolute -top-1 -right-1 text-yellow-300 animate-ping-slow',
            sparkleSize
          )}
        />
      </div>
    </div>
  );
}
