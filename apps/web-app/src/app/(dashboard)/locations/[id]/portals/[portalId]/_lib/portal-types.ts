import type { portalAdminApi } from "@/lib/api"

/** One portal as the admin API returns it — its name, type, entity label, cover and categories. */
export type PortalDetail = Awaited<ReturnType<typeof portalAdminApi.getPortal>>
