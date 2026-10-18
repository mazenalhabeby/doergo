/**
 * @jest-environment node
 */
import { renderToStaticMarkup } from "react-dom/server"
import { Clock3 } from "lucide-react"
import { ListPager } from "../list-pager"
import { StatTile } from "../stat-tile"
import { ToneChip } from "../tone-chip"
import { OptionCard, OptionRadio } from "../option-card"
import { EmptyState } from "../empty-state"
import { TONES } from "@/lib/status-tones"

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o ? `${k} ${JSON.stringify(o)}` : k) }),
}))

const html = (el: React.ReactElement) => renderToStaticMarkup(el)
const noop = () => {}

/** The approved single looks (docs/design/ui-pieces/variants.md). */
describe("one look per UI piece", () => {
  it("the pager hides itself on one page and shows five numbers around the current one", () => {
    expect(html(<ListPager page={1} totalPages={1} setPage={noop} />)).toBe("")
    const out = html(<ListPager page={7} totalPages={10} setPage={noop} numbered />)
    const numbers = [...out.matchAll(/>(\d+)<\/button>/g)].map((m) => Number(m[1]))
    expect(numbers).toEqual([5, 6, 7, 8, 9])
    expect(out).toContain('aria-current="page"')
    expect(html(<ListPager page={1} totalPages={3} setPage={noop} label="Showing 1–25 of 80" />)).toContain(
      "Showing 1–25 of 80",
    )
  })

  it("a stat tile colours its value by tone, and becomes a button only when it filters", () => {
    const quiet = html(<StatTile label="On shift" value={12} icon={Clock3} />)
    expect(quiet.startsWith("<div")).toBe(true)
    expect(quiet).toContain(TONES.primary.well) // a neutral value gets the primary icon well
    const danger = html(<StatTile label="Overdue" value="€4,820" tone="danger" onClick={noop} active />)
    expect(danger.startsWith("<button")).toBe(true)
    expect(danger).toContain('aria-pressed="true"')
    expect(danger).toContain(TONES.danger.text)
  })

  it("every tone chip reads the shared palette", () => {
    for (const tone of Object.keys(TONES) as (keyof typeof TONES)[]) {
      expect(html(<ToneChip tone={tone}>x</ToneChip>)).toContain(TONES[tone].chip)
    }
    expect(
      html(
        <ToneChip tone="success" dot>
          Up to date
        </ToneChip>,
      ),
    ).toContain("bg-current")
  })

  it("an option card marks the chosen one and keeps its button props", () => {
    const on = html(
      <OptionCard selected role="radio" aria-checked>
        <OptionRadio selected />A
      </OptionCard>,
    )
    expect(on).toContain("border-primary bg-primary/5")
    expect(on).toContain('role="radio"')
    expect(html(<OptionCard selected={false}>B</OptionCard>)).toContain("border-border")
  })

  it("the empty state takes a lucide icon or an element, and an optional action", () => {
    expect(html(<EmptyState icon={Clock3} title="Nothing yet" />)).toContain("border-dashed")
    expect(html(<EmptyState icon={<span>i</span>} title="T" action={<button>Go</button>} />)).toContain(
      "<button>Go</button>",
    )
  })
})
