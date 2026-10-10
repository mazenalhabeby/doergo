import { PenLine, CheckCheck, Printer, Ban } from "lucide-react"

/* The signing choices a contract template offers, and how its audience reads. */

export const SIGNATURE_MODES = [
  { key: "IN_APP", Icon: PenLine },
  { key: "ACKNOWLEDGE", Icon: CheckCheck },
  { key: "WET_INK", Icon: Printer },
  { key: "NONE", Icon: Ban },
] as const

/** "Everyone" · "Field Technicians" · "Anyone in Manager who is a Driver". */
export function describeAudience(
  tpl: { appliesToRole?: { name: string } | null; appliesToRoleId: string | null; appliesToPosition: string | null },
  roles: { id: string; name: string }[],
  t: (k: string, o?: Record<string, unknown>) => string,
): string {
  const role = tpl.appliesToRole?.name ?? roles.find((r) => r.id === tpl.appliesToRoleId)?.name ?? null
  const pos = tpl.appliesToPosition
  if (role && pos) return t("documents.templates.audience.roleAndJob", { role, job: pos })
  if (role) return t("documents.templates.audience.role", { role })
  if (pos) return t("documents.templates.audience.job", { job: pos })
  return t("documents.templates.audience.everyone")
}
