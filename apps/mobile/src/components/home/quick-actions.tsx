import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { orgHasAddOn } from '@hbcfield/shared/client';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useDocumentRequirements } from '../../contexts/document-requirements-context';
import { useHeldAssets } from '../../hooks/use-held-assets';
import { PressableScale } from '../pressable-scale';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT, SHADOWS } from '../../lib/constants';
import {
  DocumentsGlyph,
  EquipmentGlyph,
  MessagesGlyph,
  SupportGlyph,
  type GlyphProps,
} from './glyphs';

/**
 * The doors that were only behind the avatar.
 *
 * Every personal destination in this app — your file, the van you are holding,
 * messages, support — lived in ONE place: the
 * Profile tab, reached by tapping a 34px avatar in the header and then
 * scrolling a settings list past appearance and time format. They are not
 * settings. Somebody checking whether their licence was accepted was doing the
 * same four taps every time, through a screen about none of it.
 *
 * So they are on the home screen, as a launcher: a glyph, a word, one tap.
 *
 * ⚠️ This is NOT the management surface. Members, invitations, rotas and the
 * rest live behind More in the tab bar and stay there — a list of links sitting
 * beside another list of links is exactly what the Manage tab was deleted for.
 * The split is real: everything here is about the person holding the phone,
 * and nothing here needs a permission over anybody else.
 *
 * ⚠️ A tile appears only when its route would actually open. `Documents` needs
 * the organization to have bought the add-on; `My equipment` needs the member
 * to hold something. Offering a door the server refuses is worse than not
 * offering it — the tap is spent, and the refusal reads as a fault.
 *
 * ⚠️ There is deliberately no "Send a document" tile, though the route exists.
 * The Documents screen carries its own "+" (SupplyDocumentSheet) for handing
 * something in, so two tiles a thumb apart read as the same errand — and a
 * launcher that makes you guess which of two identical-sounding doors is the
 * right one is worse than one door. `/send-document` is the asset-proposal
 * flow and stays reachable where it means something: the Profile menu, and the
 * My equipment screen.
 *
 * ⚠️ There is no More tile, deliberately. Four is the ceiling by construction —
 * exactly one row — so a More that can never appear would be a branch nobody
 * ever runs. It earns its slot the day the set passes eight.
 *
 * Both counts come from state the app already holds (`useHeldAssets` is cached
 * per session, `useDocumentRequirements` is a context), so the strip costs no
 * request of its own.
 */

interface QuickAction {
  key: string;
  Glyph: React.ComponentType<GlyphProps>;
  label: string;
  /**
   * The glyph is INK. A tone is passed only when the tone is the message —
   * documents that actually stop work being assigned — never as decoration.
   */
  tone?: string;
  /** A number worth interrupting for. Absent is the normal case. */
  badge?: number;
  /** Badge fill; only an obligation earns a loud one. */
  badgeTone?: string;
}

/**
 * Four across, and a short row is left-aligned rather than stretched.
 *
 * Fixed quarter-width items mean the second row lines up under the first
 * whatever it holds — two tiles beside two empty quarters reads as a group that
 * ran out, which is true, where four stretched tiles would read as a different
 * grid on every account.
 */
const COLUMNS = 4;

export const QuickActions = React.memo(function QuickActions() {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { held } = useHeldAssets();
  const { total: outstandingDocs, blocksWork } = useDocumentRequirements();

  const actions: QuickAction[] = useMemo(() => {
    const out: QuickAction[] = [];

    // Obligations first.
    if (orgHasAddOn(user?.orgAddOns ?? null, 'documents')) {
      out.push({
        key: 'documents',
        Glyph: DocumentsGlyph,
        label: t('home.actions.documents', 'Documents'),
        // The one exception to ink, and the same rule the reminder card uses,
        // so the two never disagree about how serious the same documents are.
        tone: blocksWork ? COLORS.error : undefined,
        badge: outstandingDocs > 0 ? outstandingDocs : undefined,
        badgeTone: blocksWork ? COLORS.error : COLORS.warning,
      });
    }

    if (held.length > 0) {
      out.push({
        key: 'equipment',
        Glyph: EquipmentGlyph,
        label: t('home.actions.equipment', 'My equipment'),
        badge: held.length,
        // A count of what you hold is information, not an alarm.
        badgeTone: colors.textMuted,
      });
    }

    out.push({ key: 'messages', Glyph: MessagesGlyph, label: t('home.actions.messages', 'Messages') });

    out.push({ key: 'support', Glyph: SupportGlyph, label: t('home.actions.support', 'Support') });

    return out;
  }, [user?.orgAddOns, outstandingDocs, blocksWork, held.length, colors.textMuted, t]);

  // Messages and Support are ungated, so this is never empty in practice — but
  // a screen that renders a band over nothing is the bug this prevents.
  if (actions.length === 0) return null;

  const go = (key: string) => {
    const route: Record<string, string> = {
      documents: '/documents',
      equipment: '/my-assets',
      messages: '/chat',
      support: '/support',
    };
    const to = route[key];
    if (to) router.push(to as Href);
  };

  /*
    The tile is NEUTRAL and lighter than the surface it sits on.

    Four filled tiles in four hues, 80px apart, is a paint chart. A raised chip
    with one ink mark reads as a control, and it leaves the badge as the only
    colour on the strip — so an amber count is the one thing that moves, and a
    red one is impossible to miss.
  */
  const tileFill: [string, string] = isDark
    ? ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.025)']
    : [colors.card, '#FBFDFC'];

  return (
    <View style={s.wrap}>
      <View style={s.grid}>
        {actions.map((a) => (
          <PressableScale
            key={a.key}
            onPress={() => go(a.key)}
            activeScale={0.93}
            style={s.item}
            accessibilityRole="button"
            accessibilityLabel={a.badge ? `${a.label}, ${a.badge}` : a.label}
          >
            {/* The badge is pinned to the TILE, not to the quarter-width
                column — so it stays on the corner if either size changes. */}
            <View style={s.tileWrap}>
              <LinearGradient
                colors={tileFill}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={[s.tile, { borderColor: colors.border }]}
              >
                <a.Glyph
                  size={24}
                  color={a.tone ?? colors.textPrimary}
                  // Punched detail must be the tile's own fill, or it draws a
                  // grey ghost over the mark.
                  contrast={isDark ? '#22222f' : colors.card}
                />
              </LinearGradient>

              {a.badge !== undefined && a.badge > 0 && (
                <View
                  style={[
                    s.badge,
                    { backgroundColor: a.badgeTone ?? COLORS.warning, borderColor: colors.surface },
                  ]}
                >
                  <Text style={s.badgeText} numberOfLines={1}>
                    {a.badge > 9 ? '9+' : a.badge}
                  </Text>
                </View>
              )}
            </View>

            <Text style={[s.label, { color: colors.textSecondary }]} numberOfLines={2}>
              {a.label}
            </Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  wrap: { paddingHorizontal: SPACING.lg, marginTop: SPACING.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: SPACING.lg },
  item: {
    width: `${100 / COLUMNS}%`,
    alignItems: 'center',
    // The badge overhangs the tile, so the item must not clip it.
    overflow: 'visible',
  },
  tileWrap: { position: 'relative' },
  tile: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    ...SHADOWS.sm,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -7,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: 10.5,
    fontWeight: FONT_WEIGHT.bold,
    letterSpacing: -0.2,
  },
  label: {
    fontSize: FONT_SIZE.sm - 0.5,
    fontWeight: FONT_WEIGHT.medium,
    textAlign: 'center',
    lineHeight: 14,
    marginTop: SPACING.sm,
    paddingHorizontal: 2,
  },
});
