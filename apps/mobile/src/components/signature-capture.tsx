import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import SignatureScreen from 'react-native-signature-canvas';
import { Ionicons } from '@expo/vector-icons';
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
  const [showModal, setShowModal] = useState(false);
  const signatureRef = useRef<any>(null);
  const hasSigned = !!existingSignature;

  const handleSignature = (signature: string) => {
    // signature is a base64 data URL
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
      <Text style={styles.label}>{title}</Text>

      <TouchableOpacity
        style={[styles.signatureArea, hasSigned && styles.signatureAreaSigned]}
        onPress={() => setShowModal(true)}
      >
        {hasSigned ? (
          <View style={styles.signedRow}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
            <Text style={styles.signedText}>Signature captured</Text>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                onClear();
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close-circle" size={18} color={COLORS.slate400} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.placeholderRow}>
            <Ionicons name="create-outline" size={20} color={COLORS.slate400} />
            <Text style={styles.placeholderText}>Tap to sign</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal
        visible={showModal}
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={handleClear}>
              <Text style={styles.modalClearText}>Clear</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.canvasContainer}>
            <SignatureScreen
              ref={signatureRef}
              onOK={handleSignature}
              webStyle={webStyle}
              backgroundColor={COLORS.white}
              penColor={COLORS.slate800}
            />
          </View>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
              <Ionicons name="checkmark" size={20} color={COLORS.white} />
              <Text style={styles.confirmText}>Save Signature</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.slate700,
    marginBottom: SPACING.xs,
  },
  signatureArea: {
    borderWidth: 1,
    borderColor: COLORS.slate200,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.slate50,
  },
  signatureAreaSigned: {
    borderColor: COLORS.success,
    backgroundColor: COLORS.successLight,
  },
  placeholderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  placeholderText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.slate400,
  },
  signedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  signedText: {
    flex: 1,
    fontSize: FONT_SIZE.base,
    color: COLORS.success,
    fontWeight: FONT_WEIGHT.medium,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.slate200,
  },
  modalTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.slate800,
  },
  modalCancelText: {
    fontSize: FONT_SIZE.lg,
    color: COLORS.slate500,
  },
  modalClearText: {
    fontSize: FONT_SIZE.lg,
    color: COLORS.error,
  },
  canvasContainer: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.slate200,
  },
  modalFooter: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  confirmText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },
});
