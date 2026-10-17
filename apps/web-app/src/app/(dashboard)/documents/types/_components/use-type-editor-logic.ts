"use client"

import { useTranslation } from "react-i18next"
import { type DocumentTypeRow } from "@/lib/api"
import { type StarterDocumentType } from "@hbcfield/shared/client"
import { useTypeEditor } from "../_hooks/use-type-editor"

/** TypeEditor's state and handlers — everything before its markup, moved here unchanged. */
export function useTypeEditorLogic({
  type,
  starter,
  existingKeys,
  workflows,
  roles,
  onClose,
}: Pick<
  {
    type: DocumentTypeRow | null
    starter: StarterDocumentType | null
    existingKeys: Set<string>
    workflows: { id: string; name: string }[]
    roles: { id: string; name: string }[]
    onClose: () => void
  },
  "type" | "starter" | "existingKeys" | "workflows" | "roles" | "onClose"
>) {
  const { t } = useTranslation()
  const typeEditor = useTypeEditor({ type, starter, existingKeys, onClose })

  return {
    ...typeEditor,
    t,
  }
}

/** What TypeEditor and its sections read. */
export type TypeEditorState = ReturnType<typeof useTypeEditorLogic>
