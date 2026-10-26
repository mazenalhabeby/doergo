import type { IconName } from "@hbcfield/shared/client"

export type SettingsSection =
  // Organization
  | "general"
  | "members"
  | "audit-log"
  | "holidays"
  | "companies"
  // Personal
  | "profile"
  | "security"
  | "notifications"
  | "my-emails"
  | "clock-in"

interface NavItem {
  key: SettingsSection
  icon: IconName
  labelKey: string
}

export const ORG_NAV_ITEMS: NavItem[] = [
  { key: "general", icon: "settings", labelKey: "settings.nav.general" },
  { key: "members", icon: "people", labelKey: "settings.nav.members" },
  // The legal companies whose name goes on invoices and contracts. Admins only — their bank details live here.
  { key: "companies", icon: "card", labelKey: "settings.nav.companies" },
  // Nothing about task types lives here any more — not the types, and not the
  // fields they collect. Both belong to the space that runs the work, on its
  // Task Types tab, where a field is attached to the type that needs it rather
  // than to every task in the organization.
  // Org-level notification policy (who gets emailed on task/join events) —
  // these prefs are org-scoped + admin-gated, so they belong here, not under
  // Personal (where non-admins would 403 loading/saving them).
  { key: "notifications", icon: "bellLine", labelKey: "settings.nav.notifications" },
  // The calendar's days: the weekend, public holidays, company days off (shared calendar/*).
  { key: "holidays", icon: "calendarLine", labelKey: "settings.nav.holidays" },
  { key: "audit-log", icon: "timeLine", labelKey: "settings.nav.auditLog" },
]

export const PERSONAL_NAV_ITEMS: NavItem[] = [
  { key: "profile", icon: "userLine", labelKey: "settings.nav.profile" },
  { key: "security", icon: "key", labelKey: "settings.nav.security" },
  // Clock in where I stand, or always choose. Listed only with 2+ workspaces (the page asks).
  { key: "clock-in", icon: "pin", labelKey: "settings.nav.clockIn" },
  // The member's own email opt-outs. Separate from "Notifications" above, which
  // is the organization's policy and admin-only.
  { key: "my-emails", icon: "send", labelKey: "settings.nav.myEmails" },
]
