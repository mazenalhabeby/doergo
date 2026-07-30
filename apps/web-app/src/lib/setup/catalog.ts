/**
 * Thin re-export shim — the setup catalog now lives in `@hbcfield/shared`
 * (SSOT shared by web + mobile). Kept so existing web imports keep working.
 */
export {
  AREAS,
  INDUSTRIES,
  INDUSTRY_CARDS,
  FALLBACK_INDUSTRY,
  ACTIVITY_RULES,
  modulesForIndustry,
  toolsFromModules,
} from "@hbcfield/shared/client"
export type { AreaMeta, IndustryMeta, ToolConcept } from "@hbcfield/shared/client"
