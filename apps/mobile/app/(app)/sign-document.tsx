import { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';
import { useToast } from '@/island/island-context';
import { documentsApi, type DocumentChain } from '@/lib/api';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '@/lib/constants';
import { SignatureCapture } from '@/components';
import { Ground, HeaderBack, ScreenHeader } from '@/components/amazen';
import { useScreenWidth } from '@/components/screen-container';
import { goBack } from '@/lib/go-back';
import { httpsUrl, openSafeUrl } from '@/lib/safe-links';
import { useSignDocumentScreen } from '@/features/documents/use-sign-document-screen';
import { s } from '@/features/documents/sign-document-screen-helpers';
import { SignDocumentScreenSign } from '@/features/documents/sign-document-screen-sign';

export default function SignDocumentScreen() {
  const vm = useSignDocumentScreen();
  const {
    router,
    insets,
    colors,
    t,
    step,
    setStep,
    opening,
    hasRead,
    busy,
    signature,
    chain,
    title,
    isAcknowledge,
    openDocument,
    agree,
    submit,
    stepNumber,
    totalSteps,
  } = vm;
  const wide = useScreenWidth();

  return (
    <Ground style={s.screen}>
      <ScreenHeader
        title={title || t('documents.sign.title')}
        leading={<HeaderBack onPress={() => goBack()} />}
        style={wide}
      />

      <SignDocumentScreenSign vm={vm} />
    </Ground>
  );
}
