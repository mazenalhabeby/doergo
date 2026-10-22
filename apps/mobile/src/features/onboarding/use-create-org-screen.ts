import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  INDUSTRY_CARDS,
  classifyWork,
  planFromIndustry,
  toolsFromModules,
  type WorkPlan,
} from '@hbcfield/shared/client';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useToast } from '@/island/island-context';
import { onboardingApi, locationsApi } from '@/lib/api';

export type Step = 0 | 1 | 2;

/** CreateOrgScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useCreateOrgScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const toast = useToast();
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>(0);
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<WorkPlan | null>(null);
  const [fromText, setFromText] = useState(false);
  // Areas as localized display names the user can rename/remove.
  const [areaNames, setAreaNames] = useState<string[]>([]);
  const [orgName, setOrgName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // i18n resolvers (labels come from the `setup` namespace).
  const areaLabel = (key: string) => t(`setup.areaNames.${key}`);
  const toolLabel = (key: string) => t(`setup.tools.${key}`);
  const industryLabel = (key: string, fallback: string) =>
    t(`setup.industries.${key}`, { defaultValue: fallback });

  const tools = useMemo(() => (plan ? toolsFromModules(plan.moduleKeys) : []), [plan]);
  const firstName = user?.firstName || t('setup.friend');

  // ---- Q1 ----
  const onType = (v: string) => {
    setText(v);
    setFromText(true);
    setPlan(v.trim().length >= 3 ? classifyWork(v) : null);
  };
  const tapIndustry = (key: string) => {
    const ind = INDUSTRY_CARDS.find((i) => i.key === key);
    if (!ind) return;
    const p = planFromIndustry(ind);
    setPlan(p);
    setFromText(false);
    setText('');
    goToAreas(p);
  };
  const confirmText = () => {
    if (!plan) return;
    goToAreas(plan);
  };

  const goToAreas = (p: WorkPlan) => {
    setAreaNames(p.areas.map(areaLabel));
    setStep(1);
  };

  // ---- Q2: edit areas ----
  const renameArea = (i: number, v: string) =>
    setAreaNames((prev) => prev.map((n, idx) => (idx === i ? v : n)));
  const removeArea = (i: number) =>
    setAreaNames((prev) => prev.filter((_, idx) => idx !== i));
  const confirmAreas = () => {
    if (areaNames.filter((n) => n.trim()).length === 0) {
      toast.error(t('common.error'), t('setup.mobile.needOneArea'));
      return;
    }
    setStep(2);
  };

  // ---- Q3: create ----
  const handleCreate = async () => {
    const name = orgName.trim();
    if (name.length < 2) {
      toast.error(t('common.error'), t('validation.organizationNameMinLength'));
      return;
    }
    if (!plan) return;
    const names = areaNames.map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) {
      toast.error(t('common.error'), t('setup.mobile.needOneArea'));
      return;
    }

    setIsLoading(true);
    try {
      // 1. Create the org + its first space (becomes the default bucket).
      //    NOTE: mobile API can't set enabledModules — org uses defaults, tunable on web.
      await onboardingApi.createOrganization({
        name,
        industry: plan.industryLabel,
        firstSpaceName: names[0],
      });

      // 2. Create the remaining areas as spaces (concurrently, best-effort).
      if (names.length > 1) {
        await Promise.allSettled(
          names.slice(1).map((n) => locationsApi.create({ name: n })),
        );
      }

      // 3. Refresh — the nav guard redirects into the app.
      await refreshUser();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('onboarding.createOrg.failedToCreate');
      toast.error(t('common.error'), message);
      setIsLoading(false);
    }
  };

  const onBack = () => {
    if (step === 0) { router.back(); return; }
    setStep((s) => (s - 1) as Step);
  };

  return {
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
  };
}
