import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/amazen/ink-icon';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { File as FsFile } from 'expo-file-system';

import { DateField } from '@/components';
import { EquipmentFrame, useFormPalette } from '@/features/equipment/equipment-frame';
import { forgetHeldAssets } from '@/hooks/use-held-assets';
import { EquipmentPicker } from '@/features/equipment/equipment-picker';
import { useEntryDayBounds } from '@/hooks/use-entry-day-bounds';
import { assetEntryDateText, dayKeyOf, occurredAtForDay } from '@/lib/log-dates';
import { useToast } from '@/island/island-context';
import { useImagePicker } from '@/hooks/use-image-picker';
import { canScanReceipts, scanReceipt } from '@/lib/receipt-scan';
import { assetsApi, assetRegisterApi, uploadToPresignedUrl, type HeldAsset } from '@/lib/api';
import {
  normalizeKindShape,
  findLogType,
  validateLogValues,
  moneyToCents,
  COST_LOG_KEY,
  type KindLogField,
  type LogValueProblem,
  fromCents,
} from '@hbcfield/shared/client';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '@/lib/constants';
import { logColor, logTypeLabel } from '@/lib/log-display';
import { useOffline } from '@/offline/offline-context';
import { logFromPhone } from '@/offline/assets/log-actions';
import { useAssetLogScreen } from '@/features/equipment/use-asset-log-screen';
import { FieldInput, s } from '@/features/equipment/asset-log-screen-helpers';
import { NotAllowed } from '@/components/not-allowed';

/**
 * Opened from a home shortcut there is no equipment in the link: ask which one
 * first (or go straight to the only one) instead of "You do not have this one".
 */
export default function AssetLogScreenRoute() {
  const { assetId } = useLocalSearchParams<{ assetId?: string }>();
  return assetId ? <AssetLogScreen /> : <EquipmentPicker what="log" />;
}

function AssetLogScreen() {
  const {
    colors,
    COLORS,
    t,
    tt,
    insets,
    logKey,
    held,
    loading,
    draft,
    when,
    setWhen,
    note,
    setNote,
    photo,
    setPhoto,
    problems,
    reading,
    sending,
    type,
    moneyField,
    bounds,
    set,
    forgetPhoto,
    readReceipt,
    addPhoto,
    send,
    title,
  } = useAssetLogScreen();

  if (loading || logKey === COST_LOG_KEY) {
    return (
      <EquipmentFrame title={title}>
        <View style={s.centre}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      </EquipmentFrame>
    );
  }
  if (!held || !type) {
    // Reachable by deep link whatever a button points at; the server refuses too.
    return (
      <EquipmentFrame title={title}>
        <NotAllowed
          message={
            held
              ? tt('logbook.unknownType', 'This kind no longer logs that.')
              : tt('expenses.notYours', 'You do not have this one.')
          }
        />
      </EquipmentFrame>
    );
  }

  const problemFor = (key: string) => problems.find((p) => p.key === key);
  const needsApproval = type.needsApproval;

  return (
    <EquipmentFrame title={title}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xxxl + insets.bottom }}
      >
        <View style={s.assetRow}>
          <View style={[s.dot, { backgroundColor: logColor(type.color) }]} />
          <Text style={[s.asset, { color: colors.textMuted }]} numberOfLines={1}>
            {held.asset?.name ?? ''}
          </Text>
        </View>

        {moneyField && canScanReceipts() && (
          <TouchableOpacity
            onPress={readReceipt}
            disabled={reading}
            style={[s.secondary, { borderColor: colors.border }]}
          >
            {reading ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Icon name="scanCard" size={18} color={COLORS.primary} />
            )}
            <Text style={[s.secondaryText, { color: COLORS.primary }]}>
              {tt('logbook.readReceipt', 'Read the amount from a receipt')}
            </Text>
          </TouchableOpacity>
        )}

        {type.fields.map((f) => (
          <FieldInput
            key={f.key}
            field={f}
            value={draft[f.key] ?? ''}
            onChange={(v) => set(f.key, v)}
            problem={problemFor(f.key)}
            photo={f.type === 'photo' ? photo : null}
            onPhoto={addPhoto}
            onRemovePhoto={() => {
              if (photo) forgetPhoto(photo.uri);
              setPhoto(null);
            }}
            colors={colors}
            t={tt}
          />
        ))}

        <Text style={[s.label, { color: colors.textMuted }]}>{tt('logbook.when', 'When')}</Text>
        <DateField
          value={when}
          // Always a day: an entry happened on one, so there is nothing to clear it to.
          onChange={(v) => v && setWhen(v)}
          minDate={bounds.minDate}
          maxDate={bounds.maxDate}
          title={tt('logbook.when', 'When')}
        />

        <Text style={[s.label, { color: colors.textMuted, marginTop: SPACING.md }]}>{tt('expenses.note', 'Note')}</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={tt('logbook.notePh', 'Anything worth knowing')}
          placeholderTextColor={colors.textMuted}
          multiline
          style={[s.input, s.boxed, { color: colors.textPrimary, borderColor: colors.border, minHeight: 64 }]}
        />

        <TouchableOpacity onPress={send} disabled={sending} style={[s.primary, { backgroundColor: COLORS.primary }]}>
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={[s.primaryText, { color: COLORS.onPrimary }]}>{tt('logbook.send', 'Log it')}</Text>
          )}
        </TouchableOpacity>
        {needsApproval && (
          <Text style={[s.footnote, { color: colors.textMuted }]}>
            {tt('logbook.approvalHint', 'It counts once the office accepts it.')}
          </Text>
        )}
      </ScrollView>
    </EquipmentFrame>
  );
}
