/**
 * ONE IMPLEMENTATION OF "REPORT AN ISSUE", FOR EVERY SCREEN THAT OPENS ONE.
 *
 * ⚠️ THIS FILE USED TO BE THE IMPLEMENTATION, and rebuilding the sheets for
 * the shift card alone would have left two of them: the card's, following
 * `shift-clock.md` §4–§7, and this one — still showing two of the six
 * statuses, still offering the reporter an Acknowledge button, still with no
 * acknowledgement after Send. Three screens open these (the tabs layout, the
 * attendance tab and the manage tab), so the fix has to be the one they all
 * already import.
 *
 * The sheets live in `components/issues/` now, one file per sheet. This is the
 * door they came through, kept so nothing else had to change.
 */
export { ReportIssueSheet } from '../issues/report-issue-sheet';
export { ShiftIssueListSheet } from '../issues/my-issues-sheet';
export { ShiftIssueThreadSheet } from '../issues/issue-thread-sheet';
