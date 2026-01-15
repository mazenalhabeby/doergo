'use client';

import { AnimatedLogo } from '@doergo/shared/components';

export function MobileHeader() {
  return (
    <div className="flex md:hidden flex-col items-center justify-center gap-2 mb-6">
      <AnimatedLogo size="small" />
      <p className="text-xs text-slate-500">Partner Portal</p>
    </div>
  );
}
