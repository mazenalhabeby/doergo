import { useMemo, useState } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { usePitch } from '../../home/pitch';
import { lastArrival } from '../../lib/route-day';
import { hasHour } from './my-work';
import { useRouteDay } from './use-route-day';
import { AHEAD_ROWS, distanceTile } from './next-stop';

/** RouteCard's state and handlers — everything before its markup, moved here unchanged. */
export function useRouteCard({ style }: Pick<{ style?: StyleProp<ViewStyle> }, 'style'>) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const router = useRouter();
  const { formatClock } = useTimeFormat();
  const r = useRouteDay();
  const [menu, setMenu] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [foldOpen, setFoldOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  usePitch(r.state === 'none' ? { need: 0, line: t('routeCard.pitchNone') }
    : { need: 0, line: t('routeCard.pitch', { count: r.ahead.length || r.stops.length }) });

  const doneIds = useMemo(() => new Set(r.done.map((s) => s.id)), [r.done]);
  const planned = r.ordered.length > 0;
  const openPlanner = () => { setMenu(false); router.push('/(app)/route-planner' as Href); };

  const tiles: { v: string; unit?: string; l: string }[] = r.state === 'finished'
    ? [
      { v: String(r.ordered.length), unit: t('routeCard.ofN', { count: r.ordered.length }), l: t('routeCard.stopsDone') },
      distanceTile(r.route ? r.route.totalMeters : null, false, t('routeCard.driven')),
      { v: lastArrival(r.done) ? formatClock(lastArrival(r.done)!) : '—', l: t('routeCard.backAt') },
    ]
    : !planned
      ? [
        { v: String(r.stops.length), l: t('routeCard.stops', { count: r.stops.length }) },
        { v: '—', l: t('routeCard.noPlanYet') },
        { v: hasHour(r.stops[0]?.at) ? formatClock(r.stops[0]!.at!) : '—', l: t('routeCard.firstJob') },
      ]
      : [
        { v: String(r.ahead.length), l: r.done.length ? t('routeCard.left') : t('routeCard.stops', { count: r.ahead.length }) },
        distanceTile(
          r.figures.metresToGo,
          r.straight || r.figures.estimated,
          r.straight ? t('routeCard.straightLine') : t('routeCard.toGo'),
        ),
        { v: r.figures.backBy ? formatClock(r.figures.backBy) : '—', l: t('routeCard.backBy') },
      ];

  const rest = planned ? r.ahead.slice(1) : r.stops;
  const shownRest = showAll ? rest : rest.slice(0, planned ? AHEAD_ROWS : AHEAD_ROWS + 1);

  return {
    amazen,
    c,
    t,
    formatClock,
    r,
    menu,
    setMenu,
    choosing,
    setChoosing,
    foldOpen,
    setFoldOpen,
    setShowAll,
    doneIds,
    planned,
    openPlanner,
    tiles,
    rest,
    shownRest,
  };
}

/** What RouteCard and its sections read. */
export type RouteCardState = ReturnType<typeof useRouteCard>;
