'use client';

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface MobileTabSwitcherProps {
  isLoginActive: boolean;
  onTabChange: (isLogin: boolean) => void;
}

export function MobileTabSwitcher({ isLoginActive, onTabChange }: MobileTabSwitcherProps) {
  const { t } = useTranslation();
  return (
    <div className="flex md:hidden bg-slate-100 p-1 rounded-xl mb-6">
      <button
        onClick={() => onTabChange(true)}
        className={cn(
          'flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-300',
          isLoginActive
            ? 'bg-white text-slate-900 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        )}
      >
        {t('auth.mobile.signInTab')}
      </button>
      <button
        onClick={() => onTabChange(false)}
        className={cn(
          'flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-300',
          !isLoginActive
            ? 'bg-white text-slate-900 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        )}
      >
        {t('auth.mobile.createAccountTab')}
      </button>
    </div>
  );
}
