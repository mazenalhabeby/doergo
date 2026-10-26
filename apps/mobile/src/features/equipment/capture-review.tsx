import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Icon } from '@/components/amazen/ink-icon';
import { useTranslation } from 'react-i18next';
import { SPACING, RADIUS, FONT_SIZE } from '@/lib/constants';

/**
 * The foot of a "check before sending" page after a photograph — a receipt
 * (`asset-expense`) or an agreement (`send-document`): whether the picture
 * goes with it and a way to take it again, then the send button and a line
 * on what sending does. Both screens wrote it out in full.
 *
 * Colours come in, because the two screens draw on different palettes.
 */
export function CaptureReviewFoot({
  shot,
  icon,
  attachedLabel,
  missingLabel,
  onRetake,
  onSend,
  sendDisabled,
  ready,
  sending,
  sendLabel,
  sendLabelColor,
  footnote,
  primary,
  border,
  muted,
}: {
  /** A photograph is attached. */
  shot: boolean;
  /** The row's icon: `image` / `document` — outlined when nothing is attached. */
  icon: 'image' | 'document';
  attachedLabel: string;
  missingLabel: string;
  onRetake: () => void;
  onSend: () => void;
  sendDisabled: boolean;
  /** Everything needed is there: the button takes the primary colour. */
  ready: boolean;
  sending: boolean;
  sendLabel: string;
  /** The label's colour when it is not the default white. */
  sendLabelColor?: string;
  footnote: string;
  primary: string;
  border: string;
  muted: string;
}) {
  const { t } = useTranslation();
  return (
    <>
      <View style={[s.row, { borderColor: border }]}>
        <Icon name={icon === 'image' ? 'attach' : 'file'} size={18} color={shot ? '#22c55e' : muted} />
        <Text style={{ flex: 1, fontSize: FONT_SIZE.sm, color: muted }}>{shot ? attachedLabel : missingLabel}</Text>
        <TouchableOpacity onPress={onRetake}>
          <Text style={{ color: primary, fontSize: FONT_SIZE.xs, fontWeight: '700' }}>
            {shot ? t('expenses.retake', 'Retake') : t('expenses.takePhoto', 'Take one')}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={onSend}
        disabled={sendDisabled}
        style={[s.primary, { backgroundColor: ready ? primary : border }]}
      >
        {sending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={sendLabelColor ? [s.primaryText, { color: sendLabelColor }] : s.primaryText}>{sendLabel}</Text>
        )}
      </TouchableOpacity>
      <Text style={[s.footnote, { color: muted }]}>{footnote}</Text>
    </>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.lg,
  },
  primary: {
    borderRadius: RADIUS.md,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.lg,
  },
  primaryText: { color: '#fff', fontSize: FONT_SIZE.lg, fontWeight: '700' },
  footnote: { fontSize: FONT_SIZE.xs, textAlign: 'center', marginTop: SPACING.md },
});
