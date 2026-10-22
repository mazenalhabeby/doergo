import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { usePortalRequests } from '../../../../hooks/usePortalRequests';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../../contexts/auth-context';
import { useTheme } from '../../../../contexts/theme-context';
import { SPACING } from '../../../../lib/constants';
import { portalApi } from '../../../../lib/api/portal';
import { resolveMediaUrl } from '../../../../lib/api';
import { ReportGlyph, RequestsGlyph, ContactGlyph, AccountGlyph } from '../../portal-glyphs';

export const CLOSED = /COMPLET|CLOSED|CANCEL|RESOLV|DONE/i;

// Per-accent tile palette (dark + light) — a colored icon on a softly tinted
// card, matching the premium grid look. fg = icon colour.
export type AccentKey = 'blue' | 'green' | 'purple' | 'teal' | 'amber';

/** CustomerHome's state and handlers — everything before its markup, moved here unchanged. */
export function useCustomerHome() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();

  const configQ = useQuery({ queryKey: ['portal', 'config'], queryFn: portalApi.config });
  const unitsQ = useQuery({ queryKey: ['portal', 'units'], queryFn: portalApi.units });
  const { query: requestsQ, requests: portalRequests, isOnPhone } = usePortalRequests();

  const cfg = configQ.data;
  const unit = unitsQ.data?.[0];
  const requests = portalRequests;
  const recent = requests.slice(0, 3);
  const openCount = requests.filter((r) => !CLOSED.test(r.status)).length;
  const categories = (cfg?.categories ?? []).filter((c) => c.isActive !== false).slice(0, 8);

  const hour = new Date().getHours();
  const greeting =
    hour < 12
      ? t('portal.morning', 'Good morning')
      : hour < 18
        ? t('portal.afternoon', 'Good afternoon')
        : t('portal.evening', 'Good evening');

  const refreshing = configQ.isFetching || unitsQ.isFetching || requestsQ.isFetching;
  const onRefresh = () => {
    configQ.refetch();
    unitsQ.refetch();
    requestsQ.refetch();
  };

  // Optional per-portal cover photo; falls back to a premium gradient.
  const heroImage = resolveMediaUrl(cfg?.coverImageUrl);
  const officeLabel = cfg?.contactLabel || t('portal.office', 'the office');

  // Premium action grid — wired to what this portal actually does. Messages is
  // gated on the portal feature flag so we never show a dead tile.
  const tiles: {
    key: string;
    label: string;
    Glyph: React.ComponentType<{ size?: number; color: string }>;
    accent: AccentKey;
    badge?: number;
    onPress: () => void;
  }[] = [
    {
      key: 'report',
      label: t('portal.tileReport', 'Report a Maintenance Issue'),
      Glyph: ReportGlyph,
      accent: 'blue',
      onPress: () => router.push('/(customer)/report'),
    },
    {
      key: 'requests',
      label: t('portal.tileRequests', 'My Requests'),
      Glyph: RequestsGlyph,
      accent: 'green',
      badge: openCount || undefined,
      onPress: () => router.push('/(customer)/(tabs)/requests'),
    },
    ...(cfg?.features?.messages !== false
      ? [
          {
            key: 'messages',
            label: t('portal.tileContact', 'Contact {{office}}', { office: officeLabel }),
            Glyph: ContactGlyph,
            accent: 'purple' as AccentKey,
            onPress: () => router.push('/(customer)/(tabs)/messages'),
          },
        ]
      : []),
    {
      key: 'profile',
      label: t('portal.tileProfile', 'My Account'),
      Glyph: AccountGlyph,
      accent: 'teal',
      onPress: () => router.push('/(customer)/(tabs)/profile'),
    },
  ];
  const tileW = (width - SPACING.lg * 2 - SPACING.md) / 2;

  return {
    insets,
    router,
    user,
    colors,
    isDark,
    t,
    width,
    requestsQ,
    isOnPhone,
    cfg,
    unit,
    requests,
    recent,
    categories,
    greeting,
    refreshing,
    onRefresh,
    heroImage,
    tiles,
    tileW,
  };
}
