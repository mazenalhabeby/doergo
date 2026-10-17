"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { Loader2, Plus } from "lucide-react"

import { assetsApi, type AssetActivity } from "@/lib/api"
import { personName } from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { dateLocale } from "@/lib/format-date"
import { EmptyNote } from "@/components/ui/empty-note"

export function NoteBox({ assetId, onAdded }: { assetId: string; onAdded: () => void }) {
  const { t } = useTranslation()
  const [body, setBody] = useState("")

  const add = useMutation({
    mutationFn: () => assetsApi.addActivity(assetId, body.trim()),
    onSuccess: () => {
      setBody("")
      onAdded()
    },
    onError: (e: Error) => notify.error(e.message),
  })

  return (
    <div className="flex items-center gap-2">
      <Input
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // Enter posts, so a one-line note needs no trip to the button.
          if (e.key === "Enter" && body.trim() && !add.isPending) add.mutate()
        }}
        placeholder={t("assetRecords.notePh", "Add a note — inspection, damage, handover…")}
      />
      <Button disabled={!body.trim() || add.isPending} onClick={() => add.mutate()}>
        {add.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Plus className="mr-1 h-3.5 w-3.5" /> {t("assetRecords.addNote", "Add note")}
          </>
        )}
      </Button>
    </div>
  )
}

export function Timeline({ loading, activities }: { loading: boolean; activities: AssetActivity[] }) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    )
  }
  if (activities.length === 0) {
    return <EmptyNote>{t("assetRecords.noActivity", "Nothing has happened to this one yet.")}</EmptyNote>
  }

  return (
    <div className="space-y-2">
      {activities.map((a) => {
        const author = a.author ? personName(a.author) : t("assetRecords.systemAuthor", "Automatic")
        return (
          <div key={a.id} className="rounded-xl border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              {/*
                ⚠️ An unrecognised type used to fall through to "Note", so a
                system event would read as something a person wrote. That is
                worse than an ugly label: a row explaining where the asset came
                from would claim somebody typed it.
              */}
              <span className="font-semibold text-foreground">
                {a.type === "HOLDER_CHANGED"
                  ? t("assetRecords.handedOver", "Changed hands")
                  : a.type === "CREATED_FROM_CONTRACT"
                    ? t("assetRecords.fromContract", "Created from a contract")
                    : a.type === "NOTE"
                      ? t("assetRecords.note", "Note")
                      : a.type}
              </span>
              <span>·</span>
              <span>{author}</span>
              <span>·</span>
              <span>{new Date(a.createdAt).toLocaleString(dateLocale())}</span>
            </div>
            {a.body && <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{a.body}</p>}
          </div>
        )
      })}
    </div>
  )
}
