import { KIND_SHAPE_LIMITS, normalizeLogTypes } from "@hbcfield/shared/client"
import {
  CHOICE_LIMITS, addOptions, duplicateIndexes, moveOption, removeOption, renameOption, tidyOption,
} from "../choice-options"

/**
 * The choice-options list editor's rules — pinned against the shared
 * normaliser, so what the editor shows is what the save keeps.
 */

/** What saving these options would store. */
const saved = (options: string[]) =>
  normalizeLogTypes([{ label: "Fuel", fields: [{ label: "Kind", type: "choice", options }] }])[0]!.fields[0]!

describe("addOptions", () => {
  it("adds a trimmed option", () => {
    expect(addOptions(["Diesel"], "  Petrol ")).toEqual({ list: ["Diesel", "Petrol"], refused: null })
  })

  it("refuses a duplicate however it is capitalised, and says so", () => {
    expect(addOptions(["Diesel"], "DIESEL")).toEqual({ list: ["Diesel"], refused: "duplicate" })
  })

  it("refuses nothing typed without calling it a problem", () => {
    expect(addOptions(["Diesel"], "  , ;").refused).toBe("empty")
  })

  it("adds a pasted list, skipping what is already there and repeats within it", () => {
    const res = addOptions(["Diesel"], "Petrol, diesel; Electric\npetrol")
    expect(res).toEqual({ list: ["Diesel", "Petrol", "Electric"], refused: null })
  })

  it("stops at the limit the normaliser keeps", () => {
    const full = Array.from({ length: CHOICE_LIMITS.max }, (_, i) => `Option ${i}`)
    expect(CHOICE_LIMITS.max).toBe(KIND_SHAPE_LIMITS.maxChoiceOptions)
    expect(addOptions(full, "One more")).toEqual({ list: full, refused: "full" })
    const almost = full.slice(1)
    expect(addOptions(almost, "A, B, C").list).toHaveLength(CHOICE_LIMITS.max)
  })

  it("caps a label at the length the normaliser keeps", () => {
    const long = "x".repeat(CHOICE_LIMITS.maxLabel + 10)
    const { list } = addOptions([], long)
    expect(list[0]).toHaveLength(KIND_SHAPE_LIMITS.maxOptionLabel)
    expect(saved(list).options).toEqual(list)
  })
})

describe("renameOption and tidyOption", () => {
  it("keeps a space while a second word is being typed, trims when the box is left", () => {
    const typing = renameOption(["Diesel"], 0, "Heating ")
    expect(typing).toEqual(["Heating "])
    expect(tidyOption(typing, 0)).toEqual(["Heating"])
  })

  it("does not remove a blank row on blur — that would move rows under the pointer", () => {
    expect(tidyOption(["Diesel", "  ", "Petrol"], 1)).toEqual(["Diesel", "", "Petrol"])
    // …and the save drops it.
    expect(saved(["Diesel", "", "Petrol"]).options).toEqual(["Diesel", "Petrol"])
  })

  it("allows a colliding rename and flags it", () => {
    const list = renameOption(["Diesel", "Petrol"], 1, "diesel")
    expect(list).toEqual(["Diesel", "diesel"])
    expect([...duplicateIndexes(list)]).toEqual([1])
  })

  it("ignores an index that is not there", () => {
    expect(renameOption(["A"], 3, "B")).toEqual(["A"])
    expect(tidyOption(["A"], -1)).toEqual(["A"])
  })
})

describe("moveOption and removeOption", () => {
  it("swaps with a neighbour and stays put at the ends", () => {
    expect(moveOption(["A", "B", "C"], 2, -1)).toEqual(["A", "C", "B"])
    expect(moveOption(["A", "B", "C"], 0, 1)).toEqual(["B", "A", "C"])
    expect(moveOption(["A", "B"], 0, -1)).toEqual(["A", "B"])
    expect(moveOption(["A", "B"], 1, 1)).toEqual(["A", "B"])
  })

  it("the order set here is the order saved", () => {
    expect(saved(moveOption(["Diesel", "Petrol", "Electric"], 2, -1)).options).toEqual(["Diesel", "Electric", "Petrol"])
  })

  it("removes one row", () => {
    expect(removeOption(["A", "B", "C"], 1)).toEqual(["A", "C"])
  })
})

describe("duplicateIndexes", () => {
  it("flags the LATER spelling — the one the normaliser drops", () => {
    const list = ["Diesel", "Petrol", " DIESEL ", "", "petrol"]
    expect([...duplicateIndexes(list)].sort()).toEqual([2, 4])
    expect(saved(list).options).toEqual(["Diesel", "Petrol"])
  })
})
