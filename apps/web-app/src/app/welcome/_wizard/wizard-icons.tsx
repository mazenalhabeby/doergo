"use client"

import {
  Package, RefreshCw, Wrench, AlertTriangle, Search, Inbox, SprayCan, Sparkles,
  ShieldCheck, DoorOpen, Ruler, Ticket, MapPin, Truck, Trees, ClipboardList,
  LayoutGrid, Factory, Building2, HardHat, Server, Sun, Bug, Folder, Check,
  Settings, Users, User, Mail, CheckCircle2, Wand2, type LucideIcon,
} from "lucide-react"

/**
 * Single map from catalog icon keys → Lucide components. The engine stores only
 * string keys (framework-agnostic); this is the one place that binds them to
 * concrete icons, so there's no duplication across the wizard.
 */
const ICONS: Record<string, LucideIcon> = {
  package: Package,
  refresh: RefreshCw,
  wrench: Wrench,
  alert: AlertTriangle,
  search: Search,
  inbox: Inbox,
  spray: SprayCan,
  sparkles: Sparkles,
  wand: Wand2,
  shield: ShieldCheck,
  door: DoorOpen,
  ruler: Ruler,
  ticket: Ticket,
  mapPin: MapPin,
  truck: Truck,
  trees: Trees,
  clipboard: ClipboardList,
  grid: LayoutGrid,
  factory: Factory,
  building: Building2,
  hardHat: HardHat,
  server: Server,
  sun: Sun,
  bug: Bug,
  folder: Folder,
  check: Check,
  settings: Settings,
  users: Users,
  user: User,
  mail: Mail,
  checkCircle: CheckCircle2,
}

export function WizardIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Sparkles
  return <Icon className={className} strokeWidth={2} />
}
