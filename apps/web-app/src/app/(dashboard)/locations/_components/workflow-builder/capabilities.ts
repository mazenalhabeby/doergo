import { moduleI18n } from "@hbcfield/shared/client"

/**
 * The capabilities a step can ask for, and the module each one needs.
 *
 * Keys match `CAPABILITY_MODULE` in shared — the server derives the module
 * requirement from them, so this list is a label set, not a second source of
 * truth about what they mean.
 */

/** Task-type capabilities, in the order they read best. Keys match shared. */
export const TYPE_CAPABILITY_CHIPS = [
  // labelKey via moduleI18n so a chip and the Modules tab always read the same
  // word for the same module — they used a different key convention, and the
  // one here existed in no locale at all, so every chip fell back to English.
  { key: "subtasks", labelKey: moduleI18n.label("subtasks"), label: "Subtasks" },
  { key: "dependencies", labelKey: moduleI18n.label("dependencies"), label: "Dependencies" },
  { key: "sprint", labelKey: moduleI18n.label("sprints"), label: "Sprints" },
  { key: "story_points", labelKey: moduleI18n.label("story_points"), label: "Story Points" },
  { key: "epic", labelKey: moduleI18n.label("epics"), label: "Epics" },
  { key: "phase", labelKey: moduleI18n.label("phases"), label: "Phases" },
  { key: "crm", labelKey: moduleI18n.label("crm"), label: "CRM" },
] as const

export const BUILDER_CAPABILITIES = [
  {
    key: "gps",
    labelKey: "workflows.capabilities.gps",
    label: "GPS",
    hintKey: "workflows.capabilities.gpsHint",
    hint: ("Records the route while the member is at this step. Needs Route " + "tracking.")
  },
  {
    key: "timer",
    labelKey: "workflows.capabilities.timer",
    label: "Timer",
    hintKey: "workflows.capabilities.timerHint",
    hint: "Counts time on the job. Needs Time tracking."
  },
  {
    key: "checklist",
    labelKey: "workflows.capabilities.checklist",
    label: "Checklist",
    hintKey: "workflows.capabilities.checklistHint",
    hint: "A list to work through. Needs Checklists."
  },
  {
    key: "photos",
    labelKey: "workflows.capabilities.photos",
    label: "Photos",
    hintKey: "workflows.capabilities.photosHint",
    hint: "Before/after or evidence photos. Needs Attachments."
  },
  {
    key: "signature",
    labelKey: "workflows.capabilities.signature",
    label: "Signature",
    hintKey: "workflows.capabilities.signatureHint",
    hint: "Customer sign-off. Needs Service reports."
  },
  {
    key: "report",
    labelKey: "workflows.capabilities.report",
    label: "Report",
    hintKey: "workflows.capabilities.reportHint",
    hint: "Work performed and parts used. Needs Service reports."
  },
  {
    key: "form",
    labelKey: "workflows.capabilities.form",
    label: "Form",
    hintKey: "workflows.capabilities.formHint",
    hint: "Visit notes or an outcome form. Needs Custom fields."
  },
] as const
