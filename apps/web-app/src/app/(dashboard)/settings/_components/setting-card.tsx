import type { LucideIcon } from "lucide-react"

/**
 * A settings card — the board's section card (docs/design/web-redesign/Settings.dc.html): a title, one line
 * saying what it is for, then the controls. Shared by every section. `icon` and its colours are still accepted
 * from the callers but the redesign draws the card without an icon tile.
 */
export function SettingCard({
  title,
  description,
  children,
}: {
  icon?: LucideIcon
  iconColor?: string
  iconBg?: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3.5 rounded-[22px] border border-border bg-card px-5 py-[18px] shadow-shell">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
        {description && <p className="text-[12.5px] text-muted-foreground">{description}</p>}
      </div>
      <div>{children}</div>
    </section>
  )
}
