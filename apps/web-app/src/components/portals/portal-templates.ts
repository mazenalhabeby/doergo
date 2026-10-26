// Same portal-type language as the org Clients Portals page.
export const TEMPLATES = [
  {
    key: "rental",
    label: "Rental / Property",
    badge: "Rental",
    entity: "Apartment",
    blurb: "Tenants report maintenance issues (AC, plumbing…).",
    accent: "emerald",
  },
  {
    key: "logistics",
    label: "Logistics / Delivery",
    badge: "Logistics",
    entity: "Order",
    blurb: "Recipients report delivery problems (not arrived, damaged…).",
    accent: "orange",
  },
  {
    key: "workplace",
    label: "Workplace / Facilities",
    badge: "Workplace",
    entity: "Workspace",
    blurb: "Employees report facility issues (HVAC, lighting, IT…).",
    accent: "cyan",
  },
  {
    key: "custom",
    label: "Units (generic)",
    badge: "Units",
    entity: "Unit",
    blurb: "Generic units your clients are tied to.",
    accent: "slate",
  },
] as const
export const BY_KEY = Object.fromEntries(TEMPLATES.map((x) => [x.key, x]))
