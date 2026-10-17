/**
 * What can honestly be concluded from a scanned document, with no third party.
 *
 * The checks fall into three groups, and they are worth different amounts:
 *
 *   THE DOCUMENT AGAINST ITSELF — the ICAO check digits. Strong: editing a
 *   field in an image editor breaks arithmetic printed on the document.
 *
 *   THE DOCUMENT AGAINST US — does the name match the member, is it in date,
 *   has this exact document already been filed under somebody else's name?
 *   Strong for the failures it finds, silent otherwise.
 *
 *   THE DOCUMENT AGAINST THE WORLD — does it actually exist? NOT ANSWERABLE
 *   here, and the verdict says so. It needs the issuer's registry or the chip's
 *   signature.
 *
 * The verdict is therefore never "genuine". It is "nothing here is wrong",
 * which is a different and honest claim: a reviewer still looks at the picture,
 * and what this does is stop them having to notice a changed digit by eye.
 */
export {
  type ScanCheckId,
  type ScanCheckOutcome,
  type ScanCheck,
  type ScanVerdict,
  type ScanResult,
  nameMatches,
  verdictFrom,
} from './scan-checks/rules';
export { checkScan } from './scan-checks/scan';
