/**
 * The machine-readable zone, parsed and CHECKED — offline, no third party.
 *
 * The two lines at the foot of a passport and the three on an ID card are not
 * just the same data in a font a machine can read. Every field carries a check
 * digit computed over its own characters with a repeating 7-3-1 weighting, and
 * TD1/TD3 add a COMPOSITE check digit computed over most of the zone at once
 * (ICAO Doc 9303). That composite is what makes this worth doing: change the
 * expiry date on a photograph of a passport and the printed digit no longer
 * matches the data, and nothing about the forgery has to be recognised visually
 * for the arithmetic to fail.
 *
 * What this can honestly tell you:
 *   - the data in the zone is internally consistent (the check digits agree)
 *   - the document has not expired, and the holder's dates are plausible
 *   - the issuing country is a code that exists
 *   - the name and date of birth match the member we hold
 *
 * What it CANNOT tell you, and no offline check can:
 *   - that the document was ever issued by that country
 *   - that the physical document is genuine rather than a good print
 *
 * Verifying existence needs the issuer's registry or the chip's signature; both
 * mean a third party or NFC with a country's certificates. The honest claim is
 * that this catches edited data and invented numbers — which is what casual
 * forgery is — and it says so rather than showing a tick that means less than
 * a reader would assume.
 *
 * A second use, and the reason the check digits earn their place twice: they
 * validate our own READING. An OCR that mis-read a character fails the checksum
 * exactly as a forged one does, so a pass means the transcription is almost
 * certainly right and a fail means "photograph it again" rather than "you are
 * lying".
 */
export {
  type MrzFormat,
  type MrzField,
  type MrzResult,
  mrzCheckDigit,
  mrzDate,
  mrzNames,
  mrzLines,
} from './mrz/fields';
export { repairMrzLine, parseMrz } from './mrz/parse';
