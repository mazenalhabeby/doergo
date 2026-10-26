import {
  AppWindow,
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardList,
  Clock,
  Contact,
  FileText,
  Home,
  Inbox,
  Package,
  ReceiptText,
  SlidersHorizontal,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react"
import type { NavIconName } from "./nav-config"

/** One-colour line icons (no multi-colour sets — design rule). */
export const NAV_ICONS: Record<NavIconName, LucideIcon> = {
  home: Home,
  inbox: Inbox,
  tasks: ClipboardList,
  calendar: CalendarDays,
  time: Clock,
  people: Users,
  me: UserRound,
  workspaces: Building2,
  clients: Contact,
  assets: Package,
  portals: AppWindow,
  documents: FileText,
  reports: BarChart3,
  invoices: ReceiptText,
  manage: SlidersHorizontal,
}
