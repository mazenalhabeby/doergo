import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { normalizeKindShape, logTypesForKind } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { assetsApi, type HeldAsset } from '../../lib/api';
import { AText, SheetOption } from '../amazen';
import { EquipmentFrame } from './equipment-frame';
import { LoadingLine } from '../loading-line';

/** Which of the things a member holds can take this: a receipt needs money going out; a log entry needs a logbook. */
function fits(h: HeldAsset, what: 'expense' | 'log'): boolean {
  const shape = normalizeKindShape(h.asset?.category?.config);
  if (what === 'log') return logTypesForKind(shape).length > 0;
  return shape.money.enabled && shape.money.categories.some((c) => c.direction === 'out');
}

/**
 * "For which one?" — a home shortcut opens the receipt or the logbook with no
 * equipment chosen.
 *
 * ⚠️ Both used to end on "You do not have this one." — the screens looked for
 * the asset the link named, and the shortcut named none. Holding exactly one
 * thing that fits, the choice is skipped.
 */
export function EquipmentPicker({ what }: { what: 'expense' | 'log' }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const [list, setList] = useState<HeldAsset[] | null>(null);
  const [failed, setFailed] = useState(false);
  const pathname = what === 'expense' ? '/(app)/asset-expense' : '/(app)/asset-log';

  useEffect(() => {
    let live = true;
    assetsApi.mine()
      .then(({ periods }) => {
        if (!live) return;
        const ok = periods.filter((h) => fits(h, what));
        if (ok.length === 1) { router.replace({ pathname, params: { assetId: ok[0]!.assetId } } as never); return; }
        setList(ok);
      })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [what, pathname]);

  const title = what === 'expense' ? t('expenses.title', 'Add a receipt') : t('logbook.title', 'Log something');
  return (
    <EquipmentFrame title={title}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(12), gap: amazen.space(2.5) }}>
        {failed ? (
          <AText variant="body" tone="onGlass" style={{ textAlign: 'center', paddingVertical: amazen.space(8) }}>
            {t('myAssets.loadFailed', 'Could not load what you hold')}
          </AText>
        ) : list === null ? (
          <LoadingLine onGlass padUnits={8} />
        ) : list.length === 0 ? (
          <View style={{ alignItems: 'center', gap: amazen.space(2), paddingVertical: amazen.space(8) }}>
            <Ionicons name="cube-outline" size={36} color={c.inkOnGlass} />
            <AText variant="body" tone="onGlass" style={{ textAlign: 'center' }}>
              {t('equipment.nothingFits', 'Nothing you hold takes this.')}
            </AText>
          </View>
        ) : (
          <>
            <AText variant="body" tone="onGlass" style={{ paddingHorizontal: amazen.space(1) }}>
              {t('equipment.whichOne', 'For which one?')}
            </AText>
            {list.map((h) => (
              <SheetOption
                key={h.id}
                label={h.asset?.name ?? t('myAssets.anAsset', 'An asset')}
                hint={[h.asset?.category?.name, h.asset?.serialNumber].filter(Boolean).join(' · ') || undefined}
                onPress={() => router.replace({ pathname, params: { assetId: h.assetId } } as never)}
              />
            ))}
          </>
        )}
      </ScrollView>
    </EquipmentFrame>
  );
}
