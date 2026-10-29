

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


/** "lost": the page opened without a token from an email's "ask for a new link" button. */
export type LinkRefusal = "unknown" | "expired" | "lost"


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
