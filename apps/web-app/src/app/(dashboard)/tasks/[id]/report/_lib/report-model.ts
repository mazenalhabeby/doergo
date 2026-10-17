/**
 * The job report as the screen and the PDF both read it — pure, so the two can
 * never disagree about what is printed, in which order, under which number.
 *
 * The bundle (shared tasks/task-report.ts) says what EXISTS; this decides what
 * is SHOWN: the sections the person left switched on, and only those with
 * something in them.
 */
export {
  type Translate,
  type ReportToggle,
  type NumberedSection,
  availableToggles,
  visibleSections,
  sectionNumbers,
  showPrices,
  loadOffToggles,
  saveOffToggles,
  loadClientInclude,
  saveClientInclude,
  normalizeInclude,
  reportQueryKey,
  loadIssuerChoice,
  saveIssuerChoice,
  type HeadToggleGroup,
  type HeadToggle,
  HEAD_TOGGLES,
  loadHeadOff,
  saveHeadOff,
} from './report-model/toggles';
export {
  letterhead,
  reportPills,
  reportFacts,
  factRows,
  availableHeadToggles,
  formatReportMinutes,
  formatReportDistance,
  formatReportDateTime,
  formatDayHeading,
  workSteps,
  safeImageUrl,
  isImageFile,
  statusLabel,
} from './report-model/facts';
export {
  pairPhotos,
  groupEventsByDay,
  eventDotHex,
  eventSentence,
  reportFileName,
  partsTotal,
  fileTypeBadge,
  signatureName,
  signatureRole,
  answerText,
  routePath,
} from './report-model/history';
