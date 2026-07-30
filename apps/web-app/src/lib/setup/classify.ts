/**
 * Thin re-export shim — the work classifier now lives in `@hbcfield/shared`
 * (SSOT shared by web + mobile). Kept so existing web imports keep working.
 */
export { classifyWork, planFromIndustry, matchIndustry } from "@hbcfield/shared/client"
export type { WorkPlan } from "@hbcfield/shared/client"
