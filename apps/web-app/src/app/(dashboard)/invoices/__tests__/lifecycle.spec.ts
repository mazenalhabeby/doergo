import fs from "fs"
import path from "path"

import { code, strip } from "./_screen"
import {
  primaryStep, otherSteps, statusStyle, isEditable, isDeletable,
} from "../_lib/lifecycle"
import { isOutstanding } from "../_lib/aging"

/*
  THE LIFE OF AN INVOICE.

      DRAFT ──issue──▶ ISSUED ──mark as sent──▶ SENT ──mark paid──▶ PAID
        ▲                │
        └──back to draft─┘

  ⚠️ ISSUED was missing, and its absence forced a lie. A draft's PDF carries a
  DRAFT watermark — correctly, since nobody should pay or file a draft — so the
  only way to get a clean document to send was to press "Mark as sent" BEFORE
  sending it. That recorded a delivery that had not happened, and locked the
  invoice in the same click, with no confirmation and no way back.
*/

const SERVICE = path.join(
  __dirname,
  "../../../../../../api/auth-service/src/modules/invoices/invoice.service.ts",
)

/** The server's own table, read out of the service. It is the authority. */
function serverTransitions(): Record<string, string[]> {
  const src = strip(fs.readFileSync(SERVICE, "utf8"))
  const block = src.match(/const validTransitions[^=]*=\s*\{([\s\S]*?)\n\s*\};/)?.[1]
  expect(block).toBeTruthy()
  const out: Record<string, string[]> = {}
  for (const line of block!.split("\n")) {
    const m = line.match(/(\w+):\s*\[([^\]]*)\]/)
    if (!m) continue
    out[m[1]!] = (m[2]!.match(/'([A-Z]+)'/g) ?? []).map((q) => q.replace(/'/g, ""))
  }
  return out
}

const ALL = ["DRAFT", "ISSUED", "SENT", "PAID", "OVERDUE", "CANCELED"] as const

describe("the flow", () => {
  it("offers the step that was missing", () => {
    expect(primaryStep("DRAFT")?.to).toBe("ISSUED")
    expect(primaryStep("ISSUED")?.to).toBe("SENT")
    expect(primaryStep("SENT")?.to).toBe("PAID")
    expect(primaryStep("OVERDUE")?.to).toBe("PAID")
  })

  it("never jumps a draft straight to sent", () => {
    /*
      The whole point. Pressing one button used to take an editable draft to
      "delivered to the customer", skipping the state in which the document is
      final and the PDF is clean.
    */
    const offered = [primaryStep("DRAFT"), ...otherSteps("DRAFT")].filter(Boolean)
    expect(offered.map((s) => s!.to)).not.toContain("SENT")
    expect(serverTransitions().DRAFT).not.toContain("SENT")
  })

  it("can go back to draft from issued, and from nowhere else", () => {
    /*
      ⚠️ This is what makes issuing safe to press: the document is final but
      nothing has left the building. Once SENT a customer is holding it, and the
      remedy for a wrong invoice is a credit note or a cancellation — never a
      quiet rewrite of a document somebody has already filed.
    */
    expect(otherSteps("ISSUED").map((s) => s.to)).toContain("DRAFT")
    for (const from of ALL.filter((s) => s !== "ISSUED")) {
      const back = [primaryStep(from), ...otherSteps(from)].filter(Boolean).map((s) => s!.to)
      expect(back).not.toContain("DRAFT")
    }
  })

  it("settles", () => {
    // Nothing left to do, and nothing offered.
    expect(primaryStep("PAID")).toBeNull()
    expect(primaryStep("CANCELED")).toBeNull()
    expect(otherSteps("PAID")).toEqual([])
    expect(otherSteps("CANCELED")).toEqual([])
  })

  it("only ever offers a step the SERVER would accept", () => {
    /*
      ⚠️ The authority is the service's own table. A button offered here and
      refused there is a dead end somebody clicks twice before giving up — and
      the list row already had one: it offered DRAFT → SENT after the server
      stopped allowing it.
    */
    const server = serverTransitions()
    for (const from of ALL) {
      const offered = [primaryStep(from), ...otherSteps(from)].filter(Boolean).map((s) => s!.to)
      for (const to of offered) {
        expect(server[from] ?? []).toContain(to)
      }
    }
  })

  it("asks first ONLY where there is no way back", () => {
    /*
      Confirming something reversible teaches people to click through dialogs,
      which is how the dialog that mattered gets clicked through too. Issuing
      and going back to draft are both reversible; marking sent is not.
    */
    expect(primaryStep("ISSUED")?.confirm).toBe(true)
    expect(primaryStep("DRAFT")?.confirm).toBeUndefined()
    expect(otherSteps("ISSUED").find((s) => s.to === "DRAFT")?.confirm).toBeUndefined()
  })

  it("locks the invoice the moment it is issued", () => {
    // Which is the point of issuing, and what the server enforces on every write.
    expect(isEditable("DRAFT")).toBe(true)
    expect(isDeletable("DRAFT")).toBe(true)
    for (const s of ALL.filter((x) => x !== "DRAFT")) {
      expect(isEditable(s)).toBe(false)
      expect(isDeletable(s)).toBe(false)
    }
    const service = strip(fs.readFileSync(SERVICE, "utf8"))
    expect(service.match(/status !== 'DRAFT'/g)?.length).toBeGreaterThanOrEqual(4)
  })

  it("counts an issued invoice as owed", () => {
    /*
      ⚠️ The invoice DATE sets the payment term, not the day somebody happened
      to email the PDF. An invoice issued and then forgotten is exactly the case
      the outstanding figure exists to surface; leaving it out would hide the
      worst one.
    */
    expect(isOutstanding({ status: "ISSUED" })).toBe(true)
    expect(isOutstanding({ status: "PAID" })).toBe(false)
    expect(isOutstanding({ status: "DRAFT" })).toBe(false)
  })

  it("does not dress issued up as sent", () => {
    // Amber: the document is finished and the client has not got it — a to-do.
    expect(statusStyle("ISSUED")).not.toEqual(statusStyle("SENT"))
    expect(statusStyle("ISSUED").text).toMatch(/amber/)
  })
})

describe("the clean document", () => {
  it("watermarks a draft and leaves an issued invoice alone", () => {
    /*
      ⚠️ THE REASON THE STATE EXISTS. A draft must be unmistakable; an issued
      invoice is a real invoice and carries no mark.
    */
    const { invoiceStamp } = require("../../../../lib/invoice-status")
    expect(invoiceStamp("DRAFT")?.text).toBe("DRAFT")
    expect(invoiceStamp("ISSUED")).toBeNull()
    expect(invoiceStamp("SENT")).toBeNull()
    expect(invoiceStamp("PAID")?.text).toBe("PAID")
    expect(invoiceStamp("CANCELED")?.text).toBe("CANCELED")
  })
})

describe("both surfaces read one table", () => {
  const SURFACES = ["page.tsx", "[id]/page.tsx"]

  it.each(SURFACES)("%s takes its steps from the lifecycle", (surface) => {
    const src = code(surface)
    expect(src).toContain("primaryStep")
    expect(src).toContain("otherSteps")
    expect(src).toContain("statusStyle")
  })

  it.each(SURFACES)("%s decides nothing about status on its own", (surface) => {
    /*
      ⚠️ Each screen used to carry its own status map and its own idea of what
      came next — and they already disagreed about where Cancel lived. A
      lifecycle spread over two screens is a lifecycle that drifts.
    */
    const src = code(surface)
    expect(src).not.toContain("STATUS_STYLES")
    // No screen hard-codes a destination any more.
    expect(src).not.toMatch(/status:\s*"SENT"\s*\}\s*\)/)
  })
})

describe("it is said in every language", () => {
  const LOCALES = path.join(__dirname, "../../../../i18n/locales")

  it.each(["en", "de", "es", "fr", "it"])("%s", (lang) => {
    const d = JSON.parse(fs.readFileSync(path.join(LOCALES, `${lang}.json`), "utf8"))
    expect(typeof d.invoices?.statuses?.issued).toBe("string")
    for (const k of ["issue", "send", "backToDraft"]) {
      expect(typeof d.invoices?.actions?.[k]).toBe("string")
    }
    // ⚠️ The dialog is the ONE place a person is told the product does not
    // email anything. It must not ship untranslated in any language.
    expect(typeof d.invoices?.markSent?.title).toBe("string")
    expect(d.invoices?.markSent?.desc).toContain("{{number}}")
    expect(d.invoices?.markSent?.desc).toContain("{{client}}")
  })
})
