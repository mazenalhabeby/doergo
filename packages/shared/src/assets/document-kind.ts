/**
 * What IS this photograph?
 *
 * A member sends in a page. Before anything is proposed, something has to
 * decide whether it is a contract for a thing the organization should own, or a
 * fuel receipt, or a payslip, or the back of an envelope.
 *
 * ⚠️ THE FAILURE MODE THIS EXISTS TO PREVENT IS RAISING A VAN FROM A RECEIPT.
 * A false positive is not a small annoyance: it puts a proposal in a manager's
 * queue for a vehicle that does not exist, and the third time that happens the
 * queue stops being read — which costs the real proposals too. So the rule is
 * deliberately hard to satisfy: a document has to BOTH say it is an agreement
 * AND identify a specific thing. Either alone is not enough, and a page that
 * looks like a receipt is refused outright even if it manages both.
 *
 * Being wrong the other way — an unrecognised contract — costs one tap: the
 * member is offered "send it anyway" and the reviewer sees the same page.
 */

import { parseContract, type ParsedContract } from './contract';

export type DocumentKind = 'asset-contract' | 'unknown';

export interface DocumentClassification {
  kind: DocumentKind;
  confidence: 'certain' | 'likely';
  /**
   * Why it decided that, in words a person can check against the page.
   *
   * Not decoration: a classifier nobody can argue with is one people either
   * trust blindly or ignore entirely, and both are worse than one that says
   * "it says 'Mietvertrag' and carries a registration".
   */
  signals: string[];
  /** What it read, so the caller does not parse the same page twice. */
  contract: ParsedContract;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/*
  Words that mean "this page is an agreement about a thing", in the five
  languages this product ships in plus the compounds German actually prints.
*/
const AGREEMENT = [
  'mietvertrag', 'leasingvertrag', 'kaufvertrag', 'uberlassungsvertrag', 'ubergabeprotokoll',
  'dienstwagen', 'vertrag', 'leasing', 'vereinbarung',
  'contract', 'agreement', 'lease', 'rental agreement', 'hire agreement', 'handover',
  'contrato', 'arrendamiento', 'alquiler',
  'contrat', 'location longue duree', 'bail',
  'contratto', 'noleggio', 'locazione',
];

/*
  Words that mean "this page is somebody being paid, or paying".

  A purchase invoice for a van is genuinely ambiguous, and the choice here is
  deliberate: it is NOT treated as a contract. The cost of the two mistakes is
  not symmetric — a missed contract is one tap, an invented van is a queue
  nobody reads any more.
*/
const TRANSACTION = [
  'rechnung', 'quittung', 'beleg', 'kassenbon', 'zahlungsbeleg',
  'receipt', 'invoice', 'bill', 'till',
  'factura', 'recibo', 'ticket',
  'facture', 'recu',
  'fattura', 'ricevuta', 'scontrino',
];

/** Words a till roll prints beside the number that matters. */
const TOTAL = ['gesamt', 'summe', 'zu zahlen', 'total', 'importe', 'totale', 'montant', 'mwst', 'ust', 'vat', 'iva'];

const mentions = (text: string, words: string[]): string | null =>
  words.find((w) => text.includes(w)) ?? null;

/**
 * The matched word as the PAGE printed it, not as we folded it.
 *
 * The signals are shown to a person so they can check the verdict against the
 * paper in front of them, and «says "mietvertrag"» when the page says
 * "Mietvertrag" makes the reader doubt the reader.
 */
const asPrinted = (lines: string[], folded: string): string => {
  for (const line of lines) {
    const at = fold(line).indexOf(folded);
    if (at > -1) return line.slice(at, at + folded.length);
  }
  return folded;
};

/**
 * Decide what a page is, from its text.
 *
 * @param lines Top to bottom, as printed.
 */
export function classifyDocument(lines: string[], now: Date = new Date()): DocumentClassification {
  const contract = parseContract(lines, now);
  const text = fold(lines.join('\n'));
  const signals: string[] = [];

  const agreement = mentions(text, AGREEMENT);
  const transaction = mentions(text, TRANSACTION);
  const total = mentions(text, TOTAL);

  /*
    ⚠️ A till roll is refused FIRST, before anything else is weighed.

    A fuel receipt from a leasing company prints the company's name, which
    carries "leasing", and a registration, which is on every fleet slip. That is
    both conditions met — and it is a receipt. The transaction words plus a
    total are the shape of a page that records money moving, and no amount of
    contract-looking vocabulary should outvote that.
  */
  if (transaction && total) {
    return {
      kind: 'unknown',
      confidence: 'certain',
      signals: [`looks like a receipt ("${asPrinted(lines, transaction)}")`],
      contract,
    };
  }

  const identifier =
    contract.vin ? `a VIN (${contract.vin.value})`
    : contract.registration ? `a registration (${contract.registration.value})`
    : contract.serial ? `a serial number` : null;

  if (agreement) signals.push(`says "${asPrinted(lines, agreement)}"`);
  if (identifier) signals.push(`carries ${identifier}`);

  /*
    BOTH, or nothing. A page that says "Vertrag" and identifies nothing is a
    terms-and-conditions sheet; a page carrying a registration and no agreement
    word is an insurance card, a service book or a parking permit. Neither is
    something to create a record from.
  */
  if (!agreement || !identifier) {
    return { kind: 'unknown', confidence: 'certain', signals, contract };
  }

  /*
    A term makes it certain rather than likely. Two dates, an agreement word and
    a registration together is what a rental contract looks like and very little
    else does — but a document with no term is still worth proposing, because a
    purchase has no end date and is exactly the case the office cares about.
  */
  const hasTerm = !!contract.startsOn && !!contract.endsOn;
  if (hasTerm) signals.push('has a term with two dates');

  return {
    kind: 'asset-contract',
    confidence: hasTerm ? 'certain' : 'likely',
    signals,
    contract,
  };
}

/** Does this page name a thing well enough to be worth a manager's attention? */
export function worthProposing(c: DocumentClassification): boolean {
  return c.kind === 'asset-contract';
}
