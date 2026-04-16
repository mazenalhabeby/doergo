'use client';

import { useTranslation } from 'react-i18next';
import { AnimatedLogo } from '@hbcfield/shared/components';

export function MobileHeader() {
  const { t } = useTranslation();
  return (
    <div className="flex md:hidden flex-col items-center justify-center gap-2 mb-6">
      <AnimatedLogo size="small" />
      <p className="text-xs text-slate-500">{t('auth.mobile.partnerPortal')}</p>
    </div>
  );
}
