import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { overtimeApi } from '@/lib/api';

/**
 * Who decides this member's time right now, as one short line ("Anna, John +2") — read only while the clock-out
 * receipt is open, which said "your approver" (clock review C7). Online only; any failure keeps the old words.
 */
export function useMyApprovers(open: boolean): string | null {
  const { t } = useTranslation();
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    overtimeApi
      .myApprovers()
      .then((r) => {
        if (!live || !r?.names?.length) return;
        const more = r.more > 0 ? t('shiftEnd.andMore', { count: r.more, defaultValue: '+{{count}}' }) : '';
        setLine(more ? `${r.names.join(', ')} ${more}` : r.names.join(', '));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [open, t]);
  return open ? line : null;
}
