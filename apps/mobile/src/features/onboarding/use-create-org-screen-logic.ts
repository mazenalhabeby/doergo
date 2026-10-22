import { useCreateOrgScreen } from './use-create-org-screen';

/** CreateOrgScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useCreateOrgScreenLogic() {
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
  } = useCreateOrgScreen();

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

/** What CreateOrgScreen and its sections read. */
export type CreateOrgScreenState = ReturnType<typeof useCreateOrgScreenLogic>;
