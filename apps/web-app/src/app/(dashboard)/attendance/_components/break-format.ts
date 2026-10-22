import { type Break } from "@/lib/api"

/** A break type's i18n key segment (`LUNCH` → `lunch`). */
export const breakTypeKey = (type: string) => type.toLowerCase()

// Break times render in the zone WHERE the break was taken — the parent
// entry's per-entry (GPS) zone first, then the space's zone as fallback.
export const breakTz = (b: Break) => b.timeEntry?.timezone ?? b.location?.timezone ?? b.timeEntry?.location?.timezone
