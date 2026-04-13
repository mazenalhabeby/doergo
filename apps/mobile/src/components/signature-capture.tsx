import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SignatureScreen from 'react-native-signature-canvas';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/theme-context';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
} from '../lib/constants';

interface SignatureCaptureProps {
  title: string;
  onSave: (base64: string) => void;
  onClear: () => void;
  existingSignature?: string;
}

export function SignatureCapture({
  title,
  onSave,
  onClear,
  existingSignature,
}: SignatureCaptureProps) {
  const { colors } = useTheme();
  const [showModal, setShowModal] = useState(false);
  const signatureRef = useRef<any>(null);
  const insets = useSafeAreaInsets();
  const hasSigned = !!existingSignature;

  const handleSignature = (signature: string) => {
    onSave(signature);
    setShowModal(false);
  };

  const handleClear = () => {
    signatureRef.current?.clearSignature();
  };

  const handleConfirm = () => {
    signatureRef.current?.readSignature();
  };

  const webStyle = `
    .m-signature-pad { box-shadow: none; border: none; }
    .m-signature-pad--body { border: none; }
    .m-signature-pad--footer { display: none; }
    body,html { width: 100%; height: 100%; }
  `;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.triggerCard, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }, hasSigned && [styles.triggerCardSigned, { backgroundColor: colors.card }]]}
        onPress={() => setShowModal(true)}
        activeOpacity={0.7}
      >
        {hasSigned ? (
          <>
            <View style={styles.triggerSignedHeader}>
              <View style={styles.triggerSignedBadge}>
                <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                <Text style={styles.triggerSignedLabel}>{title}</Text>
              </View>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.triggerClearBtn}
              >
                <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.triggerPreview}>
              <Image
                source={{ uri: existingSignature }}
                style={styles.triggerPreviewImage}
                resizeMode="contain"
              />
            </View>
          </>
        ) : (
          <View style={styles.triggerEmpty}>
            <View style={[styles.triggerIconCircle, { backgroundColor: colors.surfaceRaised }]}>
              <Ionicons name="create-outline" size={22} color={colors.textMuted} />
            </View>
            <View>
              <Text style={[styles.triggerTitle, { color: colors.textSecondary }]}>{title}</Text>
              <Text style={[styles.triggerHint, { color: colors.textMuted }]}>Tap to sign</Text>
            </View>
          </View>
        )}
      </TouchableOpacity>

      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.surface }]}>
          {/* Header */}
          <View style={[styles.modalHeader, { paddingTop: Math.max(insets.top, SPACING.lg), backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => setShowModal(false)}
              style={styles.headerBtn}
            >
              <Text style={styles.headerCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{title}</Text>
            <TouchableOpacity onPress={handleClear} style={styles.headerBtn}>
              <Text style={styles.headerClearText}>Clear</Text>
            </TouchableOpacity>
          </View>

          {/* Canvas area */}
          <View style={styles.canvasOuter}>
            <View style={[styles.canvasCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <SignatureScreen
                ref={signatureRef}
                onOK={handleSignature}
                webStyle={webStyle}
                backgroundColor={COLORS.white}
                penColor={COLORS.slate800}
              />
              {/* Signature line */}
              <View style={[styles.signatureLine, { backgroundColor: colors.border }]} />
            </View>
            <Text style={[styles.canvasHint, { color: colors.textMuted }]}>Draw your signature above the line</Text>
          </View>

          {/* Footer */}
          <View style={[styles.modalFooter, { paddingBottom: Math.max(insets.bottom, SPACING.lg), backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <TouchableOpacity style={styles.saveButton} onPress={handleConfirm}>
              <Ionicons name="checkmark-circle" size={22} color={COLORS.white} />
              <Text style={styles.saveButtonText}>Save Signature</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.sm,
  },

  // Trigger Card (inline in completion form)
  triggerCard: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  triggerCardSigned: {
    borderColor: COLORS.success,
    borderStyle: 'solid',
  },
  triggerEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  triggerIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  triggerTitle: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.medium,
  },
  triggerHint: {
    fontSize: FONT_SIZE.sm,
    marginTop: 2,
  },
  triggerSignedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  triggerSignedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  triggerSignedLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.success,
  },
  triggerClearBtn: {
    padding: SPACING.xs,
  },
  triggerPreview: {
    height: 60,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  triggerPreviewImage: {
    width: '100%',
    height: '100%',
  },

  // Full-screen signing modal
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
  },
  headerBtn: {
    minWidth: 60,
  },
  headerTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    textAlign: 'center',
  },
  headerCancelText: {
    fontSize: FONT_SIZE.lg,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.medium,
  },
  headerClearText: {
    fontSize: FONT_SIZE.lg,
    color: COLORS.error,
    fontWeight: FONT_WEIGHT.medium,
    textAlign: 'right',
  },

  // Canvas area
  canvasOuter: {
    flex: 1,
    padding: SPACING.lg,
  },
  canvasCard: {
    flex: 1,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
  },
  signatureLine: {
    position: 'absolute',
    bottom: '25%',
    left: SPACING.xxl,
    right: SPACING.xxl,
    height: 1,
  },
  canvasHint: {
    textAlign: 'center',
    fontSize: FONT_SIZE.sm,
    marginTop: SPACING.md,
  },

  // Footer
  modalFooter: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  saveButtonText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.white,
  },
});
