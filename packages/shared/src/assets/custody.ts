/**
 * Who held a thing, and WHEN.
 *
 * `AssetHolder` answers "who has this now" and nothing else — the row is
 * deleted on a handover, so the moment Ahmed gives the Ford back there is no
 * record that he ever drove it. Every question the business actually asks is
 * about a PERIOD: what did the Ford cost while Ahmed had it, which cars has
 * Ahmed had this year, whose fuel receipt is this.
 *
 * So custody is stored as periods with a start and an end, and the current
 * holder is simply the period that has not ended. One shape answers both
 * questions, and `AssetHolder` stays exactly what it is: a fast index of "now",
 * kept in step by the service that writes a period.
 *
 * ⚠️ THE HOLDER IS NEVER WRITTEN ONTO A COST. Every entry already carries the
 * date the money moved; who held the asset that day is a LOOKUP, computed by
 * `holderOn` below. Storing it too would produce two versions of the truth the
 * first time somebody corrects a handover date — and correcting a handover date
 * is the single most likely repair in this whole feature.
 *
 * Pure and dependency-free on purpose: the phone, the browser and the server
 * all decide the same things, and a rule that runs in one place cannot disagree
 * with itself.
 */
export {
  type CustodyParty,
  type CustodyPeriod,
  type DatedAmount,
  partyKey,
  isOpen,
  covers,
  holdersOn,
  holderOn,
  openPeriods,
  custodyDays,
  type CustodyTotals,
  totalsByPeriod,
  type AttributedEntry,
  attribute,
} from './custody/periods';
export { custodyDayWindow, heldDuringDay, entryHolder, overlapMs } from './custody/day';
export { type HandoverPlan, type HandoverProblem, planHandover, canHandOver, partiesAfter } from './custody/handover';
