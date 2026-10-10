import type { WorkflowStatus } from "@/lib/api"
import type { DefinitionErrors, StepFormDraft } from "@/lib/step-forms"

// ============================================================================
// TYPES
// ============================================================================

export interface StatusEntry {
  id?: string // exists if editing an existing status
  name: string
  color: string
  isFinal: boolean
  isCanceled: boolean
  position: number
  /**
   * Translation key, for a step that came from a shipped template.
   *
   * Carried through untouched so an unedited step keeps reading in the member's
   * language. Cleared the moment the name is edited — see `nameEdited` below —
   * because from then on the name is theirs, not ours.
   */
  nameKey?: string | null
  /**
   * Where this step can go next.
   *
   * Carried through untouched when it already exists. This editor has no
   * transition control, so synthesising a chain on save would quietly flatten a
   * branching flow — the return path out of "Blocked" on a template forked from
   * the library would be gone the first time somebody renamed a step here.
   * A chain is only invented for a step that has none.
   */
  transitions?: string[]
  /**
   * What the member does at this step — gps, timer, photos, signature…
   *
   * This editor did not hold them, so anything built here was a status machine
   * with no work in it: a flow that could only change colour. They are here now,
   * which also means a template from the library keeps its behaviour when it
   * lands in this screen instead of arriving stripped.
   */
  capabilities?: string[]
  /**
   * "Ask when a job moves here" — the step's list of questions as edited.
   * null = NOT SET (the legacy rule decides); `{ fields: [] }` = ask nothing.
   */
  form: StepFormDraft
  /** The form as loaded, so a save only sends it when it actually changed. */
  initialForm: StepFormDraft
  /** What the server refused on the last save, by field. */
  formServerErrors?: DefinitionErrors
}

export interface WorkflowBuilderProps {
  /**
   * The space this flow is being built for. Its enabled modules decide which
   * capabilities can actually be honoured, so the warnings are specific rather
   * than a general "some module might be off".
   */
  spaceId?: string | null
  /** Task-type capabilities of the flow being edited. */
  initialTypeCapabilities?: string[]
  mode: "create" | "edit"
  workflowId?: string
  workflowName?: string
  initialStatuses?: WorkflowStatus[]
  onCreated?: (workflowId: string) => void
  onSaved?: () => void
  onCancel: () => void
}

// ============================================================================
// TEMPLATES
// ============================================================================

/**
 * Starter flows come from the LIBRARY, not from a list in this file.
 *
 * There used to be one here, one in shared, and one in the database — three
 * answers to "what does Field Service look like", drifting apart. The library
 * is the one that a curator can add to without a deploy, and the one whose
 * templates carry capabilities and transitions rather than just names and
 * colours.
 */
export interface Template {
  id: string
  name: string
  statuses: {
    name: string
    /** Present on a shipped step — carried into the copy so it stays translated. */
    nameKey?: string | null
    color: string
    isFinal: boolean
    isCanceled: boolean
    capabilities?: string[]
    form?: StepFormDraft
  }[]
}
