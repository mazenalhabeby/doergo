"use client"

import { useTranslation } from "react-i18next"
import { Building2, Smartphone } from "lucide-react"

import { customerStageLabel } from "@hbcfield/shared/client"
import type { customersApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Truncated } from "@/components/common/truncated"
import { UserAvatar } from "@/components/common/user-avatar"
import { Icon } from "@/components/ui/icon"
import { Chip, ROW } from "@/components/page/page-kit"

type Client = Awaited<ReturnType<typeof customersApi.list>>["data"][number]

/**
 * One client in the list (docs/design/web-redesign/Clients.dc.html — the `cltr` row): a soft avatar, the name
 * with one line under it, what kind of client it is, and the way into the record.
 */
export function CustomerRow({ c, onOpen }: { c: Client; onOpen: () => void }) {
  const { t } = useTranslation()
  /*
    The subtitle, built once.

    It is truncated to the row's width, so the same string has to be
    available whole for the hover — computing it twice is how the
    tooltip ends up saying something the row does not.
  */
  const subtitle = [
    c.isContact
      ? c.contactOf
        ? t("customers.contactAt", "Contact at {{name}}", { name: c.contactOf.name })
        : t("customers.contactTag", "Contact")
      : customerStageLabel(c.status || "LEAD"),
    !c.isContact && c.contactOf ? t("customers.atCompany", "at {{name}}", { name: c.contactOf.name }) : null,
    /*
      Who to ring, by name — and the typed `contactName` only while
      there is nobody real to name instead. That old field is printed
      here and nowhere else, so a reader seeing "Lead · Klaus Berger"
      could open the client and never find Klaus.
    */
    c.primaryContact
      ? c.contactCount && c.contactCount > 1
        ? `${c.primaryContact.name} +${c.contactCount - 1}`
        : c.primaryContact.name
      : c.contactName,
    c.phone || c.email,
  ]
    .filter(Boolean)
    .join(" · ")
  const [first, ...rest] = c.name.split(" ")

  return (
    <button
      onClick={onOpen}
      className={cn(
        ROW,
        "min-h-[62px] items-center px-3.5",
        // Dimmed: a contact is somebody else's person, sitting in a list
        // of your clients. Still readable, plainly not the same thing.
        c.isContact && "opacity-70",
      )}
    >
      {/*
        Square for a company, round for a person — the same shape
        language the client record's own header uses, so the two kinds
        are told apart before anybody reads a word.
      */}
      {c.type === "COMPANY" ? (
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-shell-accent-soft text-shell-accent">
          <Building2 className="size-4" />
        </span>
      ) : (
        <UserAvatar firstName={first} lastName={rest.join(" ")} seed={c.id} size="lg" soft className="size-9" />
      )}
      <span className="min-w-0 flex-1 leading-[1.3]">
        <Truncated text={c.name} className="text-[14.5px] font-semibold text-foreground" />
        <Truncated text={subtitle} className="text-[12.5px] text-muted-foreground" side="bottom" />
      </span>
      {c.isPortalResident ? (
        <Chip tone="accent">
          <Smartphone className="size-3" /> {t("customers.appAccess", "App access")}
        </Chip>
      ) : c.isContact ? (
        <Chip>{t("customers.contactTag", "Contact")}</Chip>
      ) : (
        <Chip>{t("customers.crmTag", "CRM")}</Chip>
      )}
      <Icon name="chevronRight" size={18} className="shrink-0 text-muted-foreground" />
    </button>
  )
}
