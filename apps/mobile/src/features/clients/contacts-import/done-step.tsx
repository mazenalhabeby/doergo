import React from 'react';
import { ScrollView, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { ContactImportSummary } from '@hbcfield/shared/client';
import { useTheme } from '../../../contexts/theme-context';
import { AText, GhostButton, PrimaryButton, Well, WellDivider, shadowDiscPrimary } from '../../../components/amazen';

/** What the SERVER did — not what the phone expected. */
export function DoneStep({
  result, spaceName, onOpen, onMore,
}: {
  result: ContactImportSummary;
  spaceName: string;
  onOpen: () => void;
  onMore: () => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const added = result.created;
  const skipped = result.results.filter((r) => r.reason === 'DUPLICATE_IN_BATCH').length;
  const shown = result.results.filter((r) => r.outcome === 'created' || r.outcome === 'filled').slice(0, 5);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: amazen.layout.gutter,
          gap: amazen.layout.block,
          paddingTop: amazen.space(8),
          paddingBottom: amazen.space(6),
        }}>
        <View style={{ alignItems: 'center', gap: amazen.space(3.5) }}>
          <View
            style={[
              {
                width: 72,
                height: 72,
                borderRadius: 36,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: c.accentSolid,
              },
              shadowDiscPrimary(c.accentSolid),
            ]}>
            <Svg width={32} height={32} viewBox="0 0 24 24">
              <Path d="m5 12 5 5 9-10" fill="none" stroke={c.accentInk} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
          <AText variant="h2" tone="strong" style={{ textAlign: 'center' }} accessibilityRole="header">
            {added ? t('contactsImport.done.title', { count: added, space: spaceName }) : t('contactsImport.done.none')}
          </AText>
          <AText variant="body" tone="onGradient" style={{ textAlign: 'center' }}>
            {t('contactsImport.done.sub', { created: result.created, filled: result.filled, existing: result.existing })}
          </AText>
          {skipped ? (
            <AText variant="caption" tone="warn" style={{ textAlign: 'center' }}>
              {t('contactsImport.done.skipped', { count: skipped })}
            </AText>
          ) : null}
        </View>
        {shown.length ? (
          <Well style={{ paddingVertical: amazen.space(1) }}>
            {shown.map((r, i) => (
              <View key={r.ref}>
                {i ? <WellDivider /> : null}
                <View style={{ paddingVertical: amazen.space(3) }}>
                  <AText variant="body" tone="strong" numberOfLines={1}>{r.name}</AText>
                </View>
              </View>
            ))}
          </Well>
        ) : null}
      </ScrollView>
      <View style={{ paddingHorizontal: amazen.layout.gutter, paddingBottom: amazen.space(4), gap: amazen.space(1.5) }}>
        <PrimaryButton label={t('contactsImport.done.open')} onPress={onOpen} />
        <GhostButton label={t('contactsImport.done.more')} onPress={onMore} />
      </View>
    </View>
  );
}
