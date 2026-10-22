"use client"

import { useTranslation } from "react-i18next"

/** A service report's signature, drawn on white like paper — or the dashed "no signature" box. */
export function SignatureDisplay({
  label,
  signature,
  name,
}: {
  label: string
  signature?: string | null
  name?: string | null
}) {
  const { t } = useTranslation()
  if (!signature) {
    return (
      <div className="flex-1">
        <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
        <div className="h-24 bg-muted rounded-lg border-2 border-dashed border-border flex items-center justify-center">
          <p className="text-xs text-muted-foreground">{t("tasks.serviceReport.noSignature")}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1">
      <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
      {/* Signatures are black ink on a transparent background — always render on
          white (like paper) so they stay visible in dark mode too. */}
      <div className="bg-white rounded-lg p-2 border border-border">
        <img
          src={signature}
          alt={t("tasks.serviceReport.signatureAlt", { label })}
          loading="lazy"
          decoding="async"
          className="h-20 w-full object-contain"
        />
        {name && <p className="text-xs text-center text-neutral-600 mt-1">{name}</p>}
      </div>
    </div>
  )
}
