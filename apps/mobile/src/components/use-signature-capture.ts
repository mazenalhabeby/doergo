import { useState, useRef, useCallback } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type NativeSignaturePadHandle } from './signature-pad-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';

export interface SignatureCaptureProps {
  title: string;
  onSave: (base64: string) => void;
  onClear: () => void;
  existingSignature?: string;
}

/** SignatureCapture's state and handlers — everything before its markup, moved here unchanged. */
export function useSignatureCapture({
  title,
  onSave,
  onClear,
  existingSignature,
}: Pick<SignatureCaptureProps, 'title' | 'onSave' | 'onClear' | 'existingSignature'>) {
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

  return {
    colors,
    isDark,
    t,
    showModal,
    isSigning,
    setIsSigning,
    signatureRef,
    winWidth,
    winHeight,
    insets,
    hasSigned,
    openPad,
    closePad,
    handleClear,
    handleConfirm,
    handleBegin,
    isTechnician,
  };
}
