import { useCallback } from 'react';
import type { IconName } from '@hbcfield/shared/client';
import { Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { SPACING, FONT_SIZE } from '../lib/constants';
import { SlideSheet, SlideSheetActions, SlideSheetHeader, useSlideSheet } from './slide-sheet';

export type ConfirmSheetVariant = 'danger' | 'warning' | 'info' | 'success';

interface ConfirmSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmSheetVariant;
  icon?: IconName;
  isLoading?: boolean;
}

const VARIANT_CONFIG: Record<
  ConfirmSheetVariant,
  {
    icon: IconName;
    buttonBg: string;
  }
> = {
  danger: { icon: 'warning', buttonBg: '#dc2626' },
  warning: { icon: 'alert', buttonBg: '#d97706' },
  info: { icon: 'info', buttonBg: '#2563eb' },
  success: { icon: 'selected', buttonBg: '#16a34a' },
};

export function ConfirmSheet({
  visible,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  icon,
  isLoading = false,
}: ConfirmSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const config = VARIANT_CONFIG[variant];
  const iconName = icon || config.icon;
  const sheet = useSlideSheet(visible);
  const { animateClose } = sheet;

  const handleClose = useCallback(() => {
    animateClose(onClose);
  }, [animateClose, onClose]);

  const handleConfirm = useCallback(() => {
    if (!isLoading) {
      animateClose(onConfirm);
    }
  }, [isLoading, animateClose, onConfirm]);

  return (
    <SlideSheet visible={visible} sheet={sheet} onClose={handleClose}>
      <SlideSheetHeader title={title} onClose={handleClose} />

      {/* Message */}
      {message ? <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text> : null}

      <SlideSheetActions
        style={styles.buttons}
        onCancel={handleClose}
        cancelLabel={cancelLabel || t('common.cancel')}
        onConfirm={handleConfirm}
        confirmLabel={confirmLabel || t('common.confirm')}
        confirmIcon={iconName}
        confirmIconSize={20}
        confirmColor={config.buttonBg}
        disabled={isLoading}
        isLoading={isLoading}
      />
    </SlideSheet>
  );
}

const styles = StyleSheet.create({
  message: {
    fontSize: FONT_SIZE.base,
    lineHeight: 22,
    marginBottom: SPACING.lg,
  },
  buttons: {
    marginTop: SPACING.sm,
  },
});
