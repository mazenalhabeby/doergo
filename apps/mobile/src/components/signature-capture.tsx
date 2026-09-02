import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import SignatureScreen from 'react-native-signature-canvas';
import { requestLandscape, releaseLandscape } from '../lib/orientation';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  SHADOWS,
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
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [showModal, setShowModal] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const signatureRef = useRef<any>(null);

  /*
    The canvas has to be BUILT at the size it will be drawn on.

    `requestLandscape()` resolves when the lock is requested, not when the OS
    has finished turning the device — so the pad mounts while still portrait and
    the rotation lands a moment later. React Native resizes the WebView, but
    signature_pad's own <canvas> keeps the backing store it was created with, so
    every touch is mapped into a coordinate space that no longer matches what is
    on screen. The stroke goes somewhere off the visible canvas and the pad
    looks dead: you draw and nothing appears.

    Remounting on width settles it, because the canvas is then created once the
    rotation is done. Safe here and nowhere else: the only rotations happen as
    the pad opens and closes, never while somebody is mid-signature — which is
    exactly the case a remount would ruin.
  */
  const { width: padWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const hasSigned = !!existingSignature;

  /*
    Open sideways, close upright.

    A signature is a WIDE, SHORT gesture; portrait gives a tall narrow strip that
    a long name runs out of room in. So the pad — and only the pad — asks for
    landscape, and hands orientation straight back to the app-wide policy when it
    closes. Everything else in the phone UI stays portrait.

    Ordered so the rotation happens BEFORE the canvas mounts and AFTER it is
    gone. Rotating remounts the WebView, and a rotation mid-stroke would discard
    what somebody had already drawn.
  */
  const openPad = useCallback(() => {
    /*
      Open the pad FIRST. The rotation is a bonus, never a precondition.

      This used to await the lock and open afterwards, which quietly made the
      signature pad depend on an orientation the app might not be allowed to
      have. iOS refuses any orientation an app has not declared in its plist,
      and the declaration only reaches a device through a NATIVE build — so on
      every binary shipped before that build, the pad opened on the far side of
      a request the OS had already refused.

      Now the pad opens regardless and asks for landscape in the background. If
      the rotation lands, the canvas rebuilds at the new width; if it never
      comes, the pad is portrait — narrow, which is where this started, and
      which is survivable in a way "nothing draws" is not.
    */
    setShowModal(true);
    void requestLandscape();
  }, []);

  const closePad = useCallback(() => {
    setShowModal(false);
    setIsSigning(false);
    // Not awaited: the modal should dismiss now, not after the OS has rotated.
    void releaseLandscape();
  }, []);

  const handleSignature = useCallback((signature: string) => {
    onSave(signature);
    closePad();
  }, [onSave, closePad]);

  const handleClear = useCallback(() => {
    signatureRef.current?.clearSignature();
    setIsSigning(false);
  }, []);

  const handleConfirm = useCallback(() => {
    signatureRef.current?.readSignature();
  }, []);

  const handleBegin = useCallback(() => {
    setIsSigning(true);
  }, []);

  // WebView styles for the signature canvas — prevent scrolling and make it fill
  const webStyle = `
    .m-signature-pad { box-shadow: none; border: none; margin: 0; }
    .m-signature-pad--body { border: none; }
    .m-signature-pad--footer { display: none; }
    body, html {
      width: 100%; height: 100%;
      margin: 0; padding: 0;
      overflow: hidden;
      touch-action: none;
      -webkit-overflow-scrolling: none;
    }
    canvas {
      touch-action: none;
      -ms-touch-action: none;
    }
  `;

  const isTechnician = title.toLowerCase().includes('technician');

  return (
    <View style={styles.container}>
      {/* Trigger Card */}
      <TouchableOpacity
        style={[
          styles.triggerCard,
          { borderColor: colors.border, backgroundColor: colors.surfaceRaised },
          hasSigned && { borderColor: COLORS.success, borderStyle: 'solid', backgroundColor: isDark ? colors.successLight : '#f0fdf4' },
        ]}
        onPress={openPad}
        activeOpacity={0.7}
      >
        {hasSigned ? (
          <View style={styles.triggerSigned}>
            <View style={styles.triggerSignedTop}>
              <View style={styles.triggerSignedBadge}>
                <View style={[styles.signedIconCircle, { backgroundColor: isDark ? colors.successLight : '#dcfce7' }]}>
                  <Ionicons name="checkmark" size={14} color={COLORS.success} />
                </View>
                <Text style={[styles.triggerSignedLabel, { color: COLORS.success }]}>{title}</Text>
              </View>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.triggerClearBtn}
              >
                <Ionicons name="refresh-outline" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={[styles.triggerPreviewContainer, { backgroundColor: isDark ? '#ffffff10' : '#ffffff' }]}>
              <Image
                source={{ uri: existingSignature }}
                style={styles.triggerPreviewImage}
                resizeMode="contain"
              />
            </View>
          </View>
        ) : (
          <View style={styles.triggerEmpty}>
            <View style={[styles.triggerIconCircle, { backgroundColor: isDark ? colors.card : '#f1f5f9' }]}>
              <Ionicons
                name={isTechnician ? 'finger-print-outline' : 'person-outline'}
                size={24}
                color={colors.textMuted}
              />
            </View>
            <View style={styles.triggerTextCol}>
              <Text style={[styles.triggerTitle, { color: colors.textPrimary }]}>{title}</Text>
              <Text style={[styles.triggerHint, { color: colors.textMuted }]}>{t('components.signatureCapture.tapToOpen')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
        )}
      </TouchableOpacity>

      {/* Full-screen Signature Modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="fullScreen"
        supportedOrientations={['portrait', 'landscape']}
        onRequestClose={closePad}
      >
        <View style={[styles.modalContainer, { backgroundColor: isDark ? '#0a0a14' : '#f8fafc' }]}>
          {/* Header */}
          <View style={[
            styles.modalHeader,
            {
              paddingTop: Math.max(insets.top, SPACING.md) + SPACING.sm,
              backgroundColor: isDark ? '#101020' : '#ffffff',
              borderBottomColor: colors.border,
            },
          ]}>
            <TouchableOpacity
              onPress={closePad}
              style={styles.headerBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>

            <View style={styles.headerCenter}>
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{title}</Text>
            </View>

            <TouchableOpacity onPress={handleClear} style={styles.headerBtn} activeOpacity={0.7}>
              <Text style={[styles.headerClearText, { color: COLORS.error }]}>{t('components.signatureCapture.clear')}</Text>
            </TouchableOpacity>
          </View>

          {/* Instruction */}
          <View style={styles.instructionRow}>
            <Ionicons
              name={isSigning ? 'pencil' : 'hand-left-outline'}
              size={16}
              color={isSigning ? COLORS.primary : colors.textMuted}
            />
            <Text style={[styles.instructionText, { color: isSigning ? COLORS.primary : colors.textMuted }]}>
              {isSigning ? t('components.signatureCapture.signing') : t('components.signatureCapture.useFingerToSign')}
            </Text>
          </View>

          {/* Canvas */}
          <View style={styles.canvasOuter}>
            <View style={[
              styles.canvasCard,
              {
                backgroundColor: '#ffffff',
                borderColor: isSigning ? COLORS.primary : (isDark ? '#333350' : '#e2e8f0'),
              },
            ]}>
              <SignatureScreen
                key={padWidth}
                ref={signatureRef}
                onOK={handleSignature}
                onBegin={handleBegin}
                webStyle={webStyle}
                backgroundColor="#ffffff"
                penColor="#1e293b"
                minWidth={1.5}
                maxWidth={3}
                dotSize={2}
                style={styles.signatureCanvas}
              />
              {/* Signature baseline */}
              <View style={styles.baselineContainer} pointerEvents="none">
                <View style={[styles.baseline, { backgroundColor: isDark ? '#d0d0d0' : '#cbd5e1' }]} />
                <Text style={[styles.baselineLabel, { color: isDark ? '#a0a0a0' : '#94a3b8' }]}>
                  {isTechnician ? t('components.signatureCapture.technician') : t('components.signatureCapture.customer')}
                </Text>
              </View>
            </View>
          </View>

          {/* Footer */}
          <View style={[
            styles.modalFooter,
            {
              paddingBottom: Math.max(insets.bottom, SPACING.lg),
              backgroundColor: isDark ? '#101020' : '#ffffff',
              borderTopColor: colors.border,
            },
          ]}>
            <TouchableOpacity
              style={[styles.saveButton, !isSigning && styles.saveButtonDisabled]}
              onPress={handleConfirm}
              disabled={!isSigning}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-circle" size={22} color={COLORS.white} />
              <Text style={styles.saveButtonText}>{t('components.signatureCapture.confirmSignature')}</Text>
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

  // =========================================================================
  // Trigger Card
  // =========================================================================
  triggerCard: {
    borderWidth: 1.5,
    borderRadius: RADIUS.lg,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  triggerEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  triggerIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  triggerTextCol: {
    flex: 1,
  },
  triggerTitle: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
  },
  triggerHint: {
    fontSize: FONT_SIZE.sm,
    marginTop: 3,
  },
  triggerSigned: {
    padding: SPACING.md,
  },
  triggerSignedTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  triggerSignedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  signedIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  triggerSignedLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
  },
  triggerClearBtn: {
    padding: SPACING.xs,
  },
  triggerPreviewContainer: {
    height: 70,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  triggerPreviewImage: {
    width: '100%',
    height: '100%',
  },

  // =========================================================================
  // Full-screen Modal
  // =========================================================================
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
    minWidth: 50,
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
  },
  headerClearText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
  },

  // Instruction
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  instructionText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
  },

  // Canvas
  canvasOuter: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  canvasCard: {
    flex: 1,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    borderWidth: 2,
    ...SHADOWS.md,
  },
  signatureCanvas: {
    flex: 1,
  },
  baselineContainer: {
    position: 'absolute',
    bottom: '22%',
    left: SPACING.xxl,
    right: SPACING.xxl,
    alignItems: 'center',
  },
  baseline: {
    width: '100%',
    height: 1,
  },
  baselineLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.medium,
    marginTop: 6,
    letterSpacing: 1,
    textTransform: 'uppercase',
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
    paddingVertical: 16,
    borderRadius: RADIUS.lg,
    ...SHADOWS.md,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.white,
  },
});
