

// ── Signing by emailed link (public — no session, token only) ───────────────

/** One document as a client's signing page shows it. */
export interface LinkDocumentRow {
  documentId: string
  signerId: string
  title: string
  forMember: string | null
  periodYear: number | null
  periodMonth: number | null
  alreadySigned: { name: string; role: string; signedAt: string }[]
  openedAt: string | null
}


export type LinkRefusal = "unknown" | "expired"


export type LinkOpenResult =
  | { ok: false; refusal: LinkRefusal }
  | {
      ok: true
      organizationName: string
      customerName: string
      expiresAt: string
      toSign: LinkDocumentRow[]
      signed: LinkDocumentRow[]
    }
