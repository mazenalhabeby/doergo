"use client"

import { keys } from "@/lib/query-keys"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  documentsApi,
  type ContractTemplateRow, type DocumentTypeRow, type MatchCandidateRow,
} from "@/lib/api"
import {
  MERGE_FIELDS, unknownTokens, renderTemplate, resolveAudiences, audienceFor,
  type StarterTemplate,
} from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"

/**
 * The template editor's draft: its fields, who it would reach, the member the
 * preview is filled with, and the save.
 */
export function useTemplateEditor({
  template, starter, templates, types, members, onClose,
}: {
  template: ContractTemplateRow | null
  starter: StarterTemplate | null
  templates: ContractTemplateRow[]
  types: DocumentTypeRow[]
  members: MatchCandidateRow[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [name, setName] = useState(
    template?.name ??
      // The blank starter's card label ("Start from nothing") is not a name
      // anybody wants on a contract.
      (starter && starter.key !== "blank"
        ? t(`documents.templates.starters.${starter.key}.name`, { defaultValue: starter.name })
        : ""),
  )
  const [typeId, setTypeId] = useState(
    template?.typeId ??
      // A conditional, not `includes(starter?.suggestedTypeKey ?? " ")`: the
      // blank starter suggests no type, and `includes("")` matches every key.
      (starter?.suggestedTypeKey
        ? types.find((ty) => ty.key.includes(starter.suggestedTypeKey))?.id
        : undefined) ??
      types[0]?.id ??
      "",
  )
  // The wording ships in the reader's language — an Austrian admin opening
  // "Dienstvertrag" and finding English clauses would rewrite it from scratch.
  const [body, setBody] = useState(
    template?.body ??
      (starter
        ? t(`documents.templates.starters.${starter.key}.body`, { defaultValue: starter.body })
        : ""),
  )
  const [roleId, setRoleId] = useState(template?.appliesToRoleId ?? "")
  const [position, setPosition] = useState(template?.appliesToPosition ?? "")
  const [mode, setMode] = useState<string>(template?.signatureMode ?? starter?.signatureMode ?? "IN_APP")
  const [previewMode, setPreviewMode] = useState<"text" | "pdf">("text")

  const unknown = useMemo(() => unknownTokens(body), [body])
  /*
    Who this draft would reach, resolved against the templates already saved.

    Not eligibility: an existing Field Technician contract keeps its people even
    while a broader draft is open, so a new organization default correctly
    reports the handful nobody else claims rather than the whole company.

    A NEW template goes last, because that is the order the server will read it
    in and ties go to the older one. An EDIT keeps its own place.
  */
  const DRAFT = "__draft__"
  const { reach, takenBy } = useMemo(() => {
    const binding = {
      appliesToRoleId: roleId || null,
      appliesToPosition: position || null,
    }
    const draft = { id: DRAFT, ...binding }
    const set = template
      ? templates.map((t) => (t.id === template.id ? { ...t, ...draft, id: DRAFT } : t))
      : [...templates, draft]

    const resolved = resolveAudiences(members, set)
    const mine = resolved.get(DRAFT) ?? []

    /*
      "Reaches nobody" has TWO causes and they need different sentences.

      Nobody matches the binding — a job title nobody holds — is a mistake to
      fix. Everybody who matches is already covered by a sharper template is
      correct behaviour, and telling somebody "no active member matches that
      role" while thirteen of them plainly do is the sort of wrong that sends
      them hunting for a bug in their own data.
    */
    const claimed = new Set(mine)
    const takers = new Map<string, number>()
    for (const m of audienceFor(members, binding)) {
      if (claimed.has(m)) continue
      const winner = [...resolved.entries()].find(([, ms]) => ms.includes(m))?.[0]
      const label = templates.find((t) => t.id === winner)?.name
      if (label) takers.set(label, (takers.get(label) ?? 0) + 1)
    }

    return { reach: mine, takenBy: [...takers.entries()].sort((a, b) => b[1] - a[1]) }
  }, [members, templates, template, roleId, position])

  /*
    The preview, filled with a REAL member.

    Whoever this template would actually reach — not a fictional "John Doe" —
    because the thing an administrator is checking is whether the letter reads
    correctly for their own people, including the ones whose job title is blank.
  */
  const sample = reach[0] ?? members[0] ?? null

  /*
    The member's REAL values, resolved once by the server.

    This screen used to invent them — today's date where a start date belongs,
    "Your company" for the company — which made its text preview disagree with
    the PDF beside it about the same contract, and disagree with what the
    member would actually receive. Asked once per member, so the live preview
    below still re-renders on every keystroke without a round trip.
  */
  const { data: resolved } = useQuery({
    queryKey: keys.documents.templatePreview(sample?.id ?? null),
    queryFn: () => documentsApi.previewTemplate({ memberId: sample?.id }),
    staleTime: 5 * 60 * 1000,
  })

  /*
    An em dash for every field until the real values arrive.

    The fallback used to be the raw body, so for the first moment on the screen
    the preview read "{{member.fullName}} is engaged by {{org.legalName}}" —
    which is the exact thing this pane exists to stop anybody having to read.
  */
  const preview = useMemo(() => {
    const values =
      resolved?.values ?? Object.fromEntries(MERGE_FIELDS.map((f) => [f.token, "—"]))
    return renderTemplate(body, values).text
  }, [body, resolved])

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        typeId, name, body,
        appliesToRoleId: roleId || undefined,
        appliesToPosition: position || undefined,
        signatureMode: mode,
      }
      return template
        ? documentsApi.updateTemplate(template.id, payload)
        : documentsApi.createTemplate(payload)
    },
    onSuccess: () => {
      notify.success(template ? t("documents.templates.saved") : t("documents.templates.created"))
      queryClient.invalidateQueries({ queryKey: keys.documents.templates() })
      onClose()
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const insert = (token: string) => setBody((b) => `${b}{{${token}}}`)
  const canSave = !!name.trim() && !!typeId && !!body.trim() && unknown.length === 0

  return {
    name, setName, typeId, setTypeId, body, setBody,
    roleId, setRoleId, position, setPosition, mode, setMode,
    previewMode, setPreviewMode,
    unknown, reach, takenBy, sample, preview,
    save, insert, canSave,
  }
}
