import { useState, useRef, useCallback } from 'react';
import {
  useWindowDimensions,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { NativeSignaturePad, type NativeSignaturePadHandle } from './signature-pad-native';
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
  const signatureRef = useRef<NativeSignaturePadHandle>(null);
  const { width: winWidth, height: winHeight } = useWindowDimensions();


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
      No rotation. The pad opens, and the phone stays where it is.

      Signing sideways was a real improvement on paper — a signature is a wide,
      short gesture and portrait gives it a tall narrow strip. In practice it
      turned the WHOLE app sideways and did not reliably come back, which is a
      much worse problem than a narrow pad. It can return when it is driven by
      the pad's own view rather than by locking the device, which is the correct
      way to do it and not a thing to attempt while signing is broken.
    */
    setShowModal(true);
  }, []);

  const closePad = useCallback(() => {
    setShowModal(false);
    setIsSigning(false);
  }, []);

  const handleSignature = useCallback((signature: string) => {
    onSave(signature);
    closePad();
  }, [onSave, closePad]);

  const handleClear = useCallback(() => {
    signatureRef.current?.clear();
    setIsSigning(false);
  }, []);

  const handleConfirm = useCallback(async () => {
    const png = await signatureRef.current?.toPng();
    // An empty pad is not a signature. The button is disabled until there is
    // ink, so this only fires if the export itself came back with nothing —
    // and sending that would seal a blank image onto a document.
    if (png) handleSignature(png);
  }, [handleSignature]);

  const handleBegin = useCallback(() => {
    setIsSigning(true);
  }, []);


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
        // Portrait only. The page turns itself; asking the OS to rotate is
        // what dragged the rest of the app around with it.
        supportedOrientations={['portrait']}
        onRequestClose={closePad}
      >
        {/*
          The PAGE turns, not the phone.

          Locking the device to landscape did rotate the pad — and everything
          else with it, including the rest of the app once the pad closed. So
          the screen stays exactly where it is and this one view is rotated
          inside it: width and height are swapped and the whole thing is turned
          a quarter turn, which makes the signing page landscape on a portrait
          phone. Turn the device and it reads the right way up.

          Nothing outside this modal is affected, because nothing outside it is
          being asked to move. Touches follow the transform — React Native
          reports them in the rotated view's own coordinates — so the pad draws
          exactly where the finger is.
        */}
        <View style={[styles.rotateHost, { backgroundColor: isDark ? '#0a0a14' : '#f8fafc' }]}>
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: isDark ? '#0a0a14' : '#f8fafc',
              width: winHeight,
              height: winWidth,
              transform: [{ rotate: '90deg' }],
              /*
                Safe areas, turned with the page.

                A quarter turn clockwise puts the page's top edge along the
                device's RIGHT edge, its right along the bottom, and so on — so
                applying `insets.top` to the page's top now pads the wrong side
                entirely, which is why the notch and the home indicator were
                sitting over the content.

                Re-mapped rather than dropped: the notch and the home bar are
                still physically there, they are just on the page's left and
                right once it is rotated.
              */
              paddingTop: insets.right,
              paddingRight: insets.bottom,
              paddingBottom: insets.left,
              paddingLeft: insets.top,
            },
          ]}
        >
          {/* Header */}
          <View style={[
            styles.modalHeader,
            {
              paddingTop: SPACING.md + SPACING.sm,
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
              <NativeSignaturePad
                ref={signatureRef}
                penColor="#1e293b"
                strokeWidth={2.6}
                onBegin={handleBegin}
                onChange={(hasInk) => setIsSigning(hasInk)}
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
              paddingBottom: SPACING.lg,
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
  /** Fills the screen and centres the rotated page inside it. */
  rotateHost: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContainer: {
    // No flex: the size is set explicitly from the swapped window dimensions,
    // because a rotated view still lays out in its parent's axes.
    overflow: 'hidden',
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
