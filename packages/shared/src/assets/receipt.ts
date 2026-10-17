/**
 * A photograph of a receipt → the three things somebody would otherwise type.
 *
 * A driver fills the van at a motorway pump and is expected to file the cost.
 * The realistic alternative is that they do not: they keep the slip in the door
 * pocket, hand a fistful of them in at the end of the month, and somebody in
 * the office types them. Reading the slip on the phone is the difference
 * between an expense filed in fifteen seconds at the pump and one filed in
 * March, badly.
 *
 * Everything here is a SUGGESTION, exactly as a scraped document date is. The
 * screen shows what was read and what was guessed in different colours and the
 * person confirms before anything is sent, because a receipt has no check digit
 * and an OCR reading 8 as 3 is not a rare event.
 *
 * ⚠️ THE AMOUNT IS THE FIELD THAT MUST NOT BE QUIETLY WRONG. A misread date is
 * visible and annoying; a misread total is money, and it is the number nobody
 * re-reads once it looks plausible. So the total is only reported as `certain`
 * when a line SAYS it is the total, and everything else is `likely` at best.
 */
export { type ReadConfidence, type ReadValue, type ParsedReceipt, moneyToCents } from './receipt/money';
export { parseReceipt, categoryForReceipt } from './receipt/parse';
