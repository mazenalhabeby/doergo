import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { PressableScale } from '../pressable-scale';
import { resolveMediaUrl } from '../../lib/api';
import { SPACING, FONT_SIZE, FONT_WEIGHT } from '../../lib/constants';
import { getAvatarColors } from './workspace/helpers';

/**
 * The crew, as one line at the foot of the screen.
 *
 * The roster the dashboard used to be built around, compressed to what a glance
 * needs: who is here (full colour, emerald ring) and who is not (dimmed). The
 * detail — names, statuses, current jobs — lives one tap away rather than
 * filling the screen with faces nobody is looking for.
 *
 * Takes people already resolved by the caller, so it inherits their scoping: a
 * viewer only ever passes members of spaces the server gave them.
 */

export interface CrewMember {
  userId: string;
  initials: string;
  imageUrl?: string;
  onShift: boolean;
}

/** Beyond this the faces stop being recognisable and start being a texture. */
const MAX_FACES = 6;

export const CrewLine = React.memo(function CrewLine({
  people,
  onPress,
}: {
  people: CrewMember[];
  onPress: () => void;
}) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  if (people.length === 0) return null;

  // People on shift first: the ones a decision can still reach today.
  const ordered = [...people].sort((a, b) => Number(b.onShift) - Number(a.onShift));
  const shown = ordered.slice(0, MAX_FACES);
  const rest = ordered.length - shown.length;

  return (
    <PressableScale onPress={onPress} activeScale={0.985}>
      <View style={s.row}>
        <View style={s.faces}>
          {shown.map((p, i) => {
            const [from] = getAvatarColors(p.userId);
            return (
              <View
                key={p.userId}
                style={[
                  s.face,
                  i > 0 && s.overlap,
                  { backgroundColor: from, borderColor: colors.surface },
                  p.onShift && s.live,
                  !p.onShift && s.dim,
                ]}
              >
                {p.imageUrl ? (
                  <Image source={{ uri: resolveMediaUrl(p.imageUrl) }} style={s.img} />
                ) : (
                  <Text style={s.initials}>{p.initials}</Text>
                )}
              </View>
            );
          })}
          {rest > 0 && (
            <View
              style={[
                s.face,
                s.overlap,
                s.more,
                { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.card, borderColor: colors.surface },
              ]}
            >
              <Text style={[s.moreText, { color: colors.textSecondary }]}>+{rest}</Text>
            </View>
          )}
        </View>

        <View style={s.link}>
          <Text style={[s.linkText, { color: colors.textMuted }]}>{t('home.crew.link')}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </View>
      </View>
    </PressableScale>
  );
});

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md },
  faces: { flexDirection: 'row', alignItems: 'center' },
  face: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    overflow: 'hidden',
  },
  overlap: { marginLeft: -12 },
  // The emerald ring IS the "on shift" signal — same green as the number above.
  live: { borderColor: '#10b981' },
  dim: { opacity: 0.55 },
  img: { width: '100%', height: '100%' },
  initials: { color: '#fff', fontSize: 12.5, fontWeight: FONT_WEIGHT.bold },
  more: { borderWidth: 3 },
  moreText: { fontSize: 12, fontWeight: FONT_WEIGHT.semibold },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 'auto' },
  linkText: { fontSize: FONT_SIZE.sm },
});
