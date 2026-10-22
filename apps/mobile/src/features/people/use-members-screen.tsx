import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useToast } from '@/island/island-context';
import { useLiveRefresh } from '@/hooks/use-live-refresh';
import { useFetchData } from '@/hooks/use-fetch-data';
import { membersApi, type OrgMember } from '@/lib/api';
import { useResponsive } from '@/lib/responsive';
import { ChoicePill } from '@/components/amazen';
import { centeredContent } from '@/components/screen-container';
import { personName } from '@hbcfield/shared/client';

export type Filter = { kind: 'all' } | { kind: 'role'; id: string } | { kind: 'none' } | { kind: 'external' };

/** MembersScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useMembersScreen() {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(720) : null;

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const [open, setOpen] = useState<OrgMember | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetched = useFetchData<OrgMember[]>({
    fetcher: membersApi.list,
    // Every trigger asks (live refresh and pull), as before; a failure shows what is there, or an empty list.
    dedupe: false,
    onError: (err, cur) => {
      toast.error(t('common.error'), (err as Error)?.message || t('manage.membersScreen.failedToLoad'));
      return cur ?? [];
    },
  });
  const members = fetched.data ?? null;
  const load = fetched.fetchData;
  useLiveRefresh(load, null);

  const list = members ?? [];
  // The roles actually held, in the order of how many hold them.
  const roles = useMemo(() => {
    const m = new Map<string, { id: string; name: string; color?: string | null; n: number }>();
    for (const x of list)
      if (x.memberRole && !x.isExternal) {
        const e = m.get(x.memberRole.id) ?? { ...x.memberRole, n: 0 };
        e.n++;
        m.set(x.memberRole.id, e);
      }
    return [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }, [list]);
  const noRole = list.filter((x) => !x.memberRole && !x.isExternal).length;
  const external = list.filter((x) => x.isExternal).length;

  const q = query.trim().toLowerCase();
  const shown = list
    .filter(
      (x) =>
        (filter.kind === 'all' ||
          (filter.kind === 'role' && x.memberRole?.id === filter.id && !x.isExternal) ||
          (filter.kind === 'none' && !x.memberRole && !x.isExternal) ||
          (filter.kind === 'external' && !!x.isExternal)) &&
        (!q || `${personName(x)} ${x.email}`.toLowerCase().includes(q)),
    )
    .sort((a, b) => personName(a).localeCompare(personName(b)));

  const remove = async () => {
    if (!open) return;
    setBusy(true);
    try {
      await membersApi.remove(open.id);
      setOpen(null);
      setConfirmRemove(false);
      await load();
    } catch (err: unknown) {
      toast.error(t('common.error'), (err as Error)?.message || t('manage.membersScreen.failedToRemove'));
    } finally {
      setBusy(false);
    }
  };

  const chip = (key: string, label: string, on: boolean, onPress: () => void, dot?: string | null) => (
    <ChoicePill key={key} label={label} on={on} onPress={onPress} dot={dot} />
  );

  return {
    amazen,
    c,
    t,
    user,
    wide,
    members,
    query,
    setQuery,
    filter,
    setFilter,
    open,
    setOpen,
    confirmRemove,
    setConfirmRemove,
    busy,
    refreshing: fetched.isRefreshing,
    refresh: fetched.refresh,
    load,
    list,
    roles,
    noRole,
    external,
    shown,
    remove,
    chip,
  };
}
