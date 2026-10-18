/**
 * Tour catalog — the SINGLE place tours are defined. Adding coverage for another
 * screen/role is just another entry here (+ a `data-tour` anchor on the target
 * and i18n keys) — no engine changes. Gates reuse the same client permission
 * helpers the navigation uses, so users only get tours for screens they have.
 */
import type { TourDef, TourGateContext } from "./types"
import { WELCOME_TOURS } from "./welcome-tours"
import { PAGE_TOURS } from "./page-tours"

export const TOURS: TourDef[] = [
  ...WELCOME_TOURS,
  ...PAGE_TOURS,

  // (Customers directory retired — its page tour was removed; customers are Spaces now.)
]
