import { AVAILABLE_MODULES } from "@hbcfield/shared/client"

/** The English source for each module, used as the fallback for its key. */
export const MODULE_LABEL: Record<string, string> = Object.fromEntries(AVAILABLE_MODULES.map((m) => [m.key, m.label]))
