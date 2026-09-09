import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, ScrollView } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, type ThemeColors } from '../lib/constants';

/**
 * The hour to be on site.
 *
 * ⚠️ Written rather than taken from `@react-native-community/datetimepicker`,
 * which is a NATIVE module: adding it would mean a store build before anybody
 * could use an appointment time, and this app ships JavaScript over the air
 * between builds. Two columns of numbers cost less than that trade.
 *
 * Minutes in five-minute steps. A client says "half nine" or "quarter past
 * two", never "09:37", and twelve options fit on a screen where sixty need a
 * scroll nobody can aim at.
 */
export function TimePickerModal({
  visible,
  value,
  onSelect,
  onClear,
  onClose,
  title,
}: {
  visible: boolean;
  /** "HH:mm", or "" when no hour is set. */
  value: string;
  onSelect: (hhmm: string) => void;
  onClear: () => void;
  onClose: () => void;
  title?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);

  const [h, setH] = useState(() => Number(value.split(':')[0] ?? 9) || 9);
  const [m, setM] = useState(() => Number(value.split(':')[1] ?? 0) || 0);

  // Re-seed when reopened on a different value, so it never shows a stale hour.
  useEffect(() => {
    if (!visible) return;
    const [hh, mm] = value.split(':');
    setH(Number(hh) || 9);
    setM(Number(mm) || 0);
  }, [visible, value]);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = useMemo(() => Array.from({ length: 12 }, (_, i) => i * 5), []);
  const two = (n: number) => String(n).padStart(2, '0');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        {/* Stops a tap inside the sheet from closing it. */}
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={s.head}>
            <Text style={s.title}>{title ?? t('createTask.beThereAt', 'Be there at')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={s.preview}>{`${two(h)}:${two(m)}`}</Text>

          <View style={s.columns}>
            <ScrollView style={s.col} contentContainerStyle={s.colInner} showsVerticalScrollIndicator={false}>
              {hours.map((x) => (
                <TouchableOpacity
                  key={x}
                  style={[s.cell, x === h && s.cellOn]}
                  onPress={() => setH(x)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: x === h }}
                >
                  <Text style={[s.cellText, x === h && s.cellTextOn]}>{two(x)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={s.colon}>:</Text>

            <ScrollView style={s.col} contentContainerStyle={s.colInner} showsVerticalScrollIndicator={false}>
              {minutes.map((x) => (
                <TouchableOpacity
                  key={x}
                  style={[s.cell, x === m && s.cellOn]}
                  onPress={() => setM(x)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: x === m }}
                >
                  <Text style={[s.cellText, x === m && s.cellTextOn]}>{two(x)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={s.actions}>
            {!!value && (
              <TouchableOpacity style={s.clear} onPress={() => { onClear(); onClose(); }}>
                <Text style={s.clearText}>{t('common.clear', 'Clear')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={s.confirm}
              onPress={() => { onSelect(`${two(h)}:${two(m)}`); onClose(); }}
            >
              <Text style={s.confirmText}>{t('common.done', 'Done')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.lg },
    sheet: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: c.surface,
      borderRadius: RADIUS.xl,
      padding: SPACING.lg,
      borderWidth: 1,
      borderColor: c.border,
    },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: c.textPrimary },
    preview: {
      marginTop: SPACING.sm,
      textAlign: 'center',
      fontSize: 34,
      fontWeight: '800',
      color: COLORS.primary,
      fontVariant: ['tabular-nums'],
    },
    columns: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.sm },
    col: { maxHeight: 210, width: 88 },
    colInner: { paddingVertical: 4 },
    colon: { fontSize: 22, fontWeight: '800', color: c.textMuted },
    cell: { paddingVertical: 10, borderRadius: RADIUS.md, alignItems: 'center' },
    cellOn: { backgroundColor: COLORS.primary },
    cellText: { fontSize: FONT_SIZE.lg, color: c.textSecondary, fontVariant: ['tabular-nums'] },
    cellTextOn: { color: COLORS.white, fontWeight: FONT_WEIGHT.bold },
    actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
    clear: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.lg, alignItems: 'center', backgroundColor: c.input },
    clearText: { color: c.textSecondary, fontWeight: FONT_WEIGHT.semibold },
    confirm: { flex: 2, paddingVertical: 12, borderRadius: RADIUS.lg, alignItems: 'center', backgroundColor: COLORS.primary },
    confirmText: { color: COLORS.white, fontWeight: FONT_WEIGHT.bold },
  });
