import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/contexts/theme-context';
import { useToast } from '../../src/island/island-context';
import { documentsApi, type DocumentChain } from '../../src/lib/api';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../src/lib/constants';
import { SignatureCapture, ScreenContainer, ScreenHeader } from '../../src/components';
import { httpsUrl, openSafeUrl } from '../../src/lib/safe-links';
import { useSignDocumentScreen } from '../../src/screens/app/use-sign-document-screen';
import { s } from '../../src/screens/app/sign-document-screen-helpers';
import { SignDocumentScreenSign } from '../../src/screens/app/sign-document-screen-sign';

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

  return (
    <View style={[s.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScreenHeader title={title || t('documents.sign.title')} />

      <SignDocumentScreenSign vm={vm} />
    </View>
  );
}
