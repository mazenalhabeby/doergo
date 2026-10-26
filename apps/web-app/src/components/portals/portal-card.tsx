"use client"

import { useTranslation } from "react-i18next"

import type { PortalSummary } from "@/lib/api"
import { portalTile } from "@/lib/portal-ui"
import { personInitials } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { Chip } from "@/components/page/page-kit"
import { BY_KEY } from "./portal-templates"

/**
 * One client portal as a card (docs/design/web-redesign/Clients.dc.html — the `clapp` card): its kind, its name,
 * what clients use it as, and how many clients and request buttons it has. The whole card opens the portal.
 */
export function PortalCard({ p, onOpen }: { p: PortalSummary; onOpen: () => void }) {
  const { t } = useTranslation()
  const meta = BY_KEY[p.templateKey] ?? BY_KEY.custom
  return (
    <button
      onClick={onOpen}
      className={
        "group flex min-w-0 flex-col overflow-hidden rounded-[22px] border border-border bg-card text-left " +
        "shadow-shell transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 " +
        "focus-visible:ring-ring"
      }
    >
      <div className="flex items-start gap-3.5 p-5">
        <span
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold",
            portalTile(meta.accent),
          )}
        >
          {personInitials(p.name)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <Chip className="self-start">{t(`portal.type.${meta.key}`, meta.badge)}</Chip>
          <span className="truncate text-[17px] font-semibold tracking-[-0.01em] text-foreground">{p.name}</span>
          <span className="truncate text-[13px] text-muted-foreground">
            {t("portal.entityIs", "Entity: {{e}}", { e: p.entityLabel })}
          </span>
        </span>
      </div>
      <div className="mt-auto flex items-center gap-4 border-t border-border px-5 py-3 text-[13px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Icon name="people" size={16} />
          <b className="font-semibold tabular-nums text-foreground">{p.residentCount}</b>
          {t("portal.residents", "clients")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Icon name="list" size={16} />
          <b className="font-semibold tabular-nums text-foreground">{p.categoryCount}</b>
          {t("portal.categories", "categories")}
        </span>
        <Icon
          name="chevronRight"
          size={18}
          className="ml-auto text-muted-foreground transition-transform group-hover:translate-x-0.5"
        />
      </div>
    </button>
  )
}
