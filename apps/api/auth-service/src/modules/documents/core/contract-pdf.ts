/**
 * Rendering a contract, and sealing a signed one.
 *
 * ── Why pdf-lib alone, and not a React renderer ─────────────────────────────
 *
 * A contract is a text document with a known structure, and the bytes it
 * produces are HASHED AND FROZEN at issue. That makes determinism the property
 * that matters most: the same template and the same values must produce the
 * same file, byte for byte, today and in five years. pdf-lib draws exactly what
 * it is told with the PDF standard fonts, which are part of the format itself
 * rather than something resolved from the machine — so there is nothing to
 * drift. It also weighs about a megabyte and pulls no React reconciler into a
 * backend service.
 *
 * ── Determinism, specifically ───────────────────────────────────────────────
 *
 * PDF files normally carry a creation date and a random document id, both of
 * which would change the hash on every render of identical content. Both are
 * pinned below. `issuedAt` is passed IN rather than read from a clock, so a
 * re-render for verification can reproduce the original exactly.
 */
export { renderContractPdf, describeDevice } from '../contract-pdf/render';
export { sealSignedPdf } from '../contract-pdf/seal';
