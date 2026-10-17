import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { normalizeKindShape, logTypesForKind, COST_LOG_KEY } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useAuth } from '../../contexts/auth-context';
import { useToast } from '../../island/island-context';
import {
  assetRegisterApi,
  locationsApi,
  type LocationAssignment,
  type RegisterAsset,
  type RegisterLogEntry,
} from '../../lib/api';
import { holdsIn } from '../../lib/permissions';
import { useResponsive } from '../../lib/responsive';
import { centeredContent } from '../screen-container';

/** RegisterRecord's state and handlers — everything before its markup, moved here unchanged. */
export function useRegisterRecord({ id }: Pick<{ id: string }, 'id'>) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(720) : null;
  const lang = i18n.language;

  const [asset, setAsset] = useState<RegisterAsset | null>(null);
  const [missing, setMissing] = useState(false);
  const [entries, setEntries] = useState<RegisterLogEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [sheet, setSheet] = useState<null | 'log' | 'status' | 'handover'>(null);
  const [busy, setBusy] = useState(false);
  const [roster, setRoster] = useState<LocationAssignment[] | null>(null);

  const reload = useCallback(async () => {
    try {
      const [a, log] = await Promise.all([assetRegisterApi.get(id), assetRegisterApi.log(id)]);
      setAsset(a);
      setEntries(log.entries);
      setCursor(log.nextCursor);
    } catch {
      setMissing(true);
    }
  }, [id]);

  /* Again on every return — an entry just filed from the logbook form shows at once. */
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const spaceId = asset?.category?.spaceId ?? null;
  const mayLog = holdsIn(user as never, 'canLogAssets', spaceId);
  const mayManage = holdsIn(user as never, 'canManageAssets', spaceId);
  const shape = useMemo(() => normalizeKindShape(asset?.category?.config), [asset]);
  const types = useMemo(() => logTypesForKind(shape).filter((ty) => ty.key !== COST_LOG_KEY), [shape]);
  /*
    Handing over follows the KIND: only a kind that is held, by members, and by
    one at a time. A kind held by clients, or by several people at once, is
    handed over on the web, where the picker shows the whole set — replacing it
    with one name from here would drop the others.
  */
  const handsOver = shape.holder.enabled && shape.holder.members && !shape.holder.multiple;

  /* The people of this workspace — whom it can be handed to. Read only when the sheet opens. */
  useEffect(() => {
    if (sheet !== 'handover' || roster || !spaceId) return;
    locationsApi.getAssignedMembers(spaceId).then(setRoster).catch(() => setRoster([]));
  }, [sheet, roster, spaceId]);

  const more = useCallback(async () => {
    if (!cursor || moreBusy) return;
    setMoreBusy(true);
    try {
      const page = await assetRegisterApi.log(id, cursor);
      setEntries((prev) => [...prev, ...page.entries]);
      setCursor(page.nextCursor);
    } catch { /* the button stays; try again */ } finally { setMoreBusy(false); }
  }, [cursor, moreBusy, id]);

  const act = useCallback(async (what: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await what();
      toast.success(done);
      setSheet(null);
      await reload();
    } catch (e: any) {
      toast.error(e?.message || t('register.failed', 'That did not work — try again.'));
    } finally {
      setBusy(false);
    }
  }, [reload, toast, t]);

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/(app)/equipment' as Href));

  return {
    amazen,
    c,
    t,
    user,
    wide,
    lang,
    asset,
    missing,
    entries,
    cursor,
    moreBusy,
    sheet,
    setSheet,
    busy,
    roster,
    spaceId,
    mayLog,
    mayManage,
    shape,
    types,
    handsOver,
    more,
    act,
    back,
  };
}

/** What RegisterRecord and its sections read. */
export type RegisterRecordState = ReturnType<typeof useRegisterRecord>;
