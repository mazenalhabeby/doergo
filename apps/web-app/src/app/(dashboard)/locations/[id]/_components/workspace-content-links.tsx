"use client"

import Link from "next/link"
import { useTranslation } from "react-i18next"
import { ChevronRight, Contact, Package, LayoutTemplate, FileText } from "lucide-react"
import { type CompanyLocation } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { useRouteAccess } from "@/hooks/use-route-access"

/** What this workspace has — clients, assets, portals, invoices — as links to those pages, filtered to it. */
export function WorkspaceContentLinks({ space }: { space: CompanyLocation }) {
  const { t } = useTranslation()
  const { hasPlanFeature } = useAuth()
  const access = useRouteAccess()
  /*
    What this workspace HAS, as links rather than tabs.

    Clients, assets and portals moved to their own pages — they are content, not
    settings, and this page is settings. The path from a workspace survives as
    one row: the same screens, pre-filtered to this one, a click away. Only what
    the workspace actually runs appears.
  */
  const mods = (space.enabledModules ?? []) as string[]
  // …and only where the page behind the link would open for this reader (the route table).
  const contentLinks = [
    {
      href: "/clients",
      label: t("customers.title", "Customers"),
      Icon: Contact,
      show: mods.includes("crm") && access.may("/clients"),
    },
    {
      href: "/assets",
      label: t("assetKinds.title", "Assets"),
      Icon: Package,
      show: mods.includes("assets") && access.may("/assets"),
    },
    {
      href: "/portals",
      label: t("portal.title", "Client portal"),
      Icon: LayoutTemplate,
      show: mods.includes("b2c_portal") && access.may("/portals"),
    },
    /*
      ⚠️ Invoicing is an organization OPTION, not a per-space module, so it is
      not in `mods` — and what decides whether this workspace can be billed is
      what it IS. You invoice a customer site, never your own warehouse.
    */
    {
      href: "/invoices",
      label: t("invoices.title"),
      Icon: FileText,
      show: space.kind === "CUSTOMER" && hasPlanFeature("invoicing"),
    },
  ].filter((l) => l.show)

  if (contentLinks.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {contentLinks.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={`${href}?space=${space.id}`}
          className={
            "inline-flex items-center gap-2 rounded-lg border border-border bg-card " +
            "px-3 py-2 text-sm font-medium text-foreground transition-colors " +
            "hover:bg-muted/60"
          }
        >
          <Icon className="h-4 w-4 text-muted-foreground" />
          {label}
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </Link>
      ))}
    </div>
  )
}
