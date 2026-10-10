import { Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { AText } from './amazen';

/**
 * The foot of a shift sheet (Clock out, Break): ONE jade button, then "Not yet"
 * as a text line under it.
 *
 * ⚠️ NOTHING DISABLES THE BUTTON but a request already in flight — never "you
 * have not filled something in". ⚠️ CANCEL IS A TEXT LINE, NOT A SECOND
 * BUTTON: you almost never cancel these, so it must not weigh the same as
 * confirming. Both sheets wrote this out in full; one copy keeps the two rules
 * in one place.
 */
export function SheetConfirmFooter({
  label,
  onConfirm,
  onCancel,
  isLoading,
}: {
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <>
      <Pressable
        onPress={onConfirm}
        disabled={isLoading}
        accessibilityRole="button"
        style={({ pressed }) => ({
          marginTop: amazen.space(5),
          paddingVertical: amazen.space(3.5),
          alignItems: 'center',
          borderRadius: amazen.radius.full,
          backgroundColor: c.accentSolid,
          opacity: isLoading ? 0.5 : pressed ? 0.85 : 1,
        })}
      >
        <AText variant="body" style={{ color: c.accentInk, fontFamily: amazen.font.sansMedium }}>
          {label}
        </AText>
      </Pressable>

      <Pressable onPress={onCancel} accessibilityRole="button" hitSlop={10} style={{ alignSelf: 'center', marginTop: amazen.space(3) }}>
        <AText variant="caption" tone="muted">
          {t('shiftEnd.notYet', { defaultValue: 'Not yet' })}
        </AText>
      </Pressable>
    </>
  );
}
