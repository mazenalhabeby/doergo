/**
 * Guided create-org wizard (mobile port of the web setup wizard).
 *
 * Tap-first, 3 quick questions → a real org + spaces via the shared setup engine:
 *   1. What you do   → industry tap-cards + optional free text (classifyWork / planFromIndustry)
 *   2. Group work    → confirm/rename/remove the derived work areas (become Spaces)
 *   3. Name + confirm→ org name + a summary, then Create
 *
 * The setup catalog/classifier is the shared SSOT (`@hbcfield/shared/client`).
 * NOTE: the mobile onboarding API can't set `enabledModules` (no such param on
 * createOrganization / locationsApi.create), so we DON'T send modules here — the
 * org uses its defaults and the enabled modules can be adjusted later on web.
 */
import { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import {
  INDUSTRY_CARDS,
  AREAS,
  classifyWork,
  planFromIndustry,
  toolsFromModules,
  type WorkPlan,
} from '@hbcfield/shared/client';
import { Ground } from '@/components/amazen';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useToast } from '@/island/island-context';
import { onboardingApi, locationsApi } from '@/lib/api';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS } from '@/lib/constants';
import { useCreateOrgScreen } from '@/features/onboarding/use-create-org-screen';
import {
  ionicon,
  TOTAL_STEPS,
  Kicker,
  Chip,
  SummaryRow,
  styles,
} from '@/features/onboarding/create-org-screen-helpers';
import { useCreateOrgScreenLogic } from '@/features/onboarding/use-create-org-screen-logic';
import { CreateOrgScreenStepOf } from '@/features/onboarding/create-org-screen-step-of';

export default function CreateOrgScreen() {
  const vm = useCreateOrgScreenLogic();
  const {
    insets,
    colors,
    isDark,
    t,
    step,
    text,
    plan,
    fromText,
    areaNames,
    orgName,
    setOrgName,
    isLoading,
    areaLabel,
    toolLabel,
    industryLabel,
    tools,
    firstName,
    onType,
    tapIndustry,
    confirmText,
    renameArea,
    removeArea,
    confirmAreas,
    handleCreate,
    onBack,
  } = vm;

  return (
    <Ground style={styles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <CreateOrgScreenStepOf vm={vm} />
    </Ground>
  );
}
