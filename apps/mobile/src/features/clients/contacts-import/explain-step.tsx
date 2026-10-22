import React from 'react';
import { Linking, ScrollView, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/theme-context';
import { AText, Eyebrow, GhostButton, PrimaryButton, Well, WellDivider } from '../../../components/amazen';
import type { MediaAccess } from '../../../permissions/use-media-access';

/**
 * What happens to an address book, said BEFORE the system asks for it.
 *
 * ⚠️ EVERY LINE IS A CLAIM THE CODE KEEPS, not reassurance — the same rule as
 * `permissions/purposes.ts`:
 *   · read here      → `useContactsImport` compares hashes locally;
 *   · only ticked    → `buildContactImport` sends picked people, picked fields;
 *   · business only  → the picker hides what looks private and warns on it;
 *   · provenance     → the server writes "Imported from …" on every new client.
 * Change one of those and this screen becomes the lie.
 */
export function ExplainStep({
  access, importerName, available, onContinue, onCancel,
}: {
  access: MediaAccess;
  importerName: string;
  /** This build carries the contacts module at all. */
  available: boolean;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();

  const points: { icon: React.ReactNode; title: string; sub: string; accent?: boolean }[] = [
    {
      accent: true,
      icon: <><Rect x={5} y={11} width={14} height={10} rx={2} /><Path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
      title: t('contactsImport.explain.localTitle'), sub: t('contactsImport.explain.localSub'),
    },
    { icon: <Path d="m5 12 5 5 9-10" />, title: t('contactsImport.explain.tickTitle'), sub: t('contactsImport.explain.tickSub') },
    {
      icon: <><Rect x={3} y={7} width={12} height={13} rx={1.5} /><Path d="M15 11h5v9h-5M7 11h4M7 15h4" /></>,
      title: t('contactsImport.explain.workTitle'), sub: t('contactsImport.explain.workSub'),
    },
    {
      icon: <><Circle cx={12} cy={12} r={9} /><Path d="M12 8v4l3 2" /></>,
      title: t('contactsImport.explain.sourceTitle'), sub: t('contactsImport.explain.sourceSub', { name: importerName }),
    },
  ];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: amazen.layout.gutter,
          gap: amazen.layout.block,
          paddingBottom: amazen.space(6),
        }}>
        <View style={{ gap: amazen.space(1.5), paddingTop: amazen.space(2) }}>
          <Eyebrow tone="onGradient">{t('contactsImport.explain.eyebrow')}</Eyebrow>
          <AText variant="h2" tone="strong">{t('contactsImport.explain.title')}</AText>
        </View>
        <Well style={{ paddingVertical: amazen.space(1) }}>
          {points.map((p, i) => (
            <View key={p.title}>
              {i ? <WellDivider /> : null}
              <View style={{ flexDirection: 'row', gap: amazen.space(3), paddingVertical: amazen.space(3.5) }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: amazen.radius.tile,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: p.accent ? c.accentTint : c.tile,
                  }}>
                  <Svg
                    width={22}
                    height={22}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={p.accent ? c.accent : c.ink}
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round">
                    {p.icon}
                  </Svg>
                </View>
                <View style={{ flex: 1 }}>
                  <AText variant="body" tone="strong">{p.title}</AText>
                  <AText variant="caption" tone="muted">{p.sub}</AText>
                </View>
              </View>
            </View>
          ))}
        </Well>
        <AText variant="caption" tone="onGradient" style={{ paddingHorizontal: amazen.space(1) }}>
          {t('contactsImport.explain.choice')}
        </AText>
        {!available ? (
          <AText variant="caption" tone="warn" style={{ paddingHorizontal: amazen.space(1) }}>
            {t('contactsImport.explain.unavailable')}
          </AText>
        ) : access.blocked ? (
          <AText variant="caption" tone="warn" style={{ paddingHorizontal: amazen.space(1) }}>{t('contactsImport.explain.blocked')}</AText>
        ) : null}
      </ScrollView>
      <View style={{ paddingHorizontal: amazen.layout.gutter, paddingBottom: amazen.space(4), gap: amazen.space(1.5) }}>
        {available ? (
          access.blocked ? (
            <PrimaryButton label={t('contactsImport.explain.openSettings')} onPress={() => void Linking.openSettings()} />
          ) : (
            <PrimaryButton label={t('contactsImport.explain.continue')} loading={access.asking || !access.resolved} onPress={onContinue} />
          )
        ) : null}
        <GhostButton label={t('contactsImport.explain.notNow')} onPress={onCancel} />
      </View>
    </View>
  );
}
