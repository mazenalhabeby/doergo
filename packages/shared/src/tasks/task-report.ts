/**
 * The full report for ONE job — "what happened on this job", start to finish,
 * as one document the office keeps and (in its client copy) hands to the client.
 *
 * Pure: the response TYPES, the section order, and the one rule that turns the
 * office copy into the client copy. Built by task-service (TaskReportService),
 * completed by the gateway (the route), rendered by the web. Browser-safe.
 *
 * ⚠️ THE CLIENT COPY IS MADE ON THE SERVER. `toClientCopy` runs in task-service
 * before the bundle leaves it, and the gateway never adds the route to a client
 * copy — so a client PDF cannot carry a comment, a price or a person's "my
 * issue" because of a rendering bug: the bytes are simply not in the response.
 * The web only ever DRAWS what it was sent.
 *
 * ⚠️ WHITELIST, NEVER BLACKLIST. The client copy is built from the fields it
 * keeps, not by deleting the ones it hides: a field added to the office copy
 * next year is then absent from the client copy until somebody decides it
 * belongs there, instead of leaking into it by default.
 */
export {
  REPORT_COPIES,
  type TaskReportCopy,
  parseReportCopy,
  REPORT_COPY_INVALID,
  REPORT_NOT_FINISHED,
  REPORT_ISSUER_INVALID,
  finishedStatusKeys,
  isJobFinished,
  TASK_REPORT_SECTIONS,
  type TaskReportSection,
  REPORT_SECTION_MODULE,
  CLIENT_COPY_HIDDEN,
  CLIENT_COPY_OPTIONS,
  type ClientCopyOption,
  REPORT_INCLUDE_INVALID,
  parseClientCopyInclude,
  CLIENT_SAFE_EVENTS,
  CLIENT_SAFE_EVENT_TYPES,
  EVENT_PERSON_KEYS,
} from './report/sections';
export type {
  TaskReportPerson,
  TaskReportStatus,
  TaskReportFile,
  TaskReportIssuerOption,
  TaskReportIssuer,
  TaskReportClient,
  TaskReportContact,
  TaskReportHeader,
  TaskReportRequest,
  TaskReportWork,
  TaskReportTime,
  TaskReportPhotoSource,
  TaskReportPhoto,
  TaskReportChecklistItem,
  TaskReportStepAnswer,
  TaskReportStepSubmission,
  TaskReportPart,
  TaskReportRoute,
  TaskReportEvent,
  TaskReportComment,
  TaskReportHandover,
  TaskReportDetail,
  TaskReportSignatureKind,
  TaskReportSignature,
  TaskReport,
} from './report/types';
export {
  REPORT_HISTORY_MAX,
  portalRequestReference,
  safeSignatureDataUrl,
  reportIssuerOptions,
  presentSections,
  clientSafeEvent,
  toClientCopy,
  type TrackedTaskRoute,
  toReportRoute,
} from './report/client-copy';
