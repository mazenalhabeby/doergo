import {
  Key,
  Building2,
  Bell,
  Users,
  Mail,
  Clock,
  CalendarDays,
  Landmark,
} from "lucide-react"

export type SettingsSection =
  // Organization
  | "general" | "members" | "audit-log" | "holidays" | "companies"
  // Personal
  | "profile" | "security" | "notifications" | "my-emails"

export interface NavItem {
  key: SettingsSection
  icon: typeof Building2
  labelKey: string
}

export const ORG_NAV_ITEMS: NavItem[] = [
  { key: "general", icon: Building2, labelKey: "settings.nav.general" },
  { key: "members", icon: Users, labelKey: "settings.nav.members" },
  // The legal companies whose name goes on invoices and contracts. Admins only — their bank details live here.
  { key: "companies", icon: Landmark, labelKey: "settings.nav.companies" },
  // Nothing about task types lives here any more — not the types, and not the
  // fields they collect. Both belong to the space that runs the work, on its
  // Task Types tab, where a field is attached to the type that needs it rather
  // than to every task in the organization.
  // Org-level notification policy (who gets emailed on task/join events) —
  // these prefs are org-scoped + admin-gated, so they belong here, not under
  // Personal (where non-admins would 403 loading/saving them).
  { key: "notifications", icon: Bell, labelKey: "settings.nav.notifications" },
  // The calendar's days: the weekend, public holidays, company days off (shared calendar/*).
  { key: "holidays", icon: CalendarDays, labelKey: "settings.nav.holidays" },
  { key: "audit-log", icon: Clock, labelKey: "settings.nav.auditLog" },
]

export const PERSONAL_NAV_ITEMS: NavItem[] = [
  { key: "profile", icon: Users, labelKey: "settings.nav.profile" },
  { key: "security", icon: Key, labelKey: "settings.nav.security" },
  // The member's own email opt-outs. Separate from "Notifications" above, which
  // is the organization's policy and admin-only.
  { key: "my-emails", icon: Mail, labelKey: "settings.nav.myEmails" },
]
