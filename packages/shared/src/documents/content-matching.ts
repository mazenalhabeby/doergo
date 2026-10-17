/**
 * Reading a document to find out whose it is and what it is for.
 *
 * The filename matcher next door reads `2026-08_holub_monika.pdf` and gets both
 * answers for free. Real files are not always named that way: a freelancer's
 * invoice arrives as `8.pdf` — the invoice NUMBER — while the page itself says
 * "DATE 31.08.2026" and carries the sender's name and email. Everything needed
 * was inside the file, and nothing looked.
 *
 * So this reads the text. It is held to the SAME standard as the filename
 * matcher, and the standard is the point: being wrong once is not something you
 * can take back, so every rule here refuses rather than guesses.
 *
 *   • a date is only a period when a LABEL says it is one
 *   • a due date is never a period, and is rejected explicitly
 *   • two labelled dates that disagree produce nothing
 *   • the filename and the document disagreeing is a reason to STOP, not to
 *     pick a winner
 *
 * Pure. The caller extracts the text; this decides what it means.
 */
export { type ContentPeriod, readPeriodFromText, readEmailsFromText } from './content-matching/read';
export { matchTextToMember, needsScan, type ContentMatch, readContent, mergeMatch } from './content-matching/match';
