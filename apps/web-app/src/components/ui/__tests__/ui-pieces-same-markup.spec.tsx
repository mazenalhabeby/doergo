/**
 * @jest-environment node
 */
import { renderToStaticMarkup } from "react-dom/server"
import { Check, Package } from "lucide-react"
import { cn } from "@/lib/utils"
import { ChoiceChip } from "../choice-chip"
import { DashedEmptyBox, EmptyNote, PageNotice } from "../empty-note"

/*
  The shared pieces replaced copies that were written out identically. Each one
  must keep rendering EXACTLY what those copies rendered — the "before" JSX below
  is the copy as it stood, so a change to a shared piece that would move a screen
  fails here first (a new look goes through the user's mockup review instead).
*/
// Attribute ORDER never changes a page, so each tag's attributes are sorted; everything else must match.
const sortAttrs = (tag: string) =>
  tag.replace(
    /^<(\w+)((?:\s+[\w-]+(?:="[^"]*")?)*)(\s*\/?)>$/,
    (_m, name: string, attrs: string, end: string) =>
      `<${name}${(attrs.match(/\s+[\w-]+(?:="[^"]*")?/g) ?? [])
        .map((a) => a.trim())
        .sort()
        .map((a) => " " + a)
        .join("")}${end}>`,
  )
const html = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<\w+[^<>]*>/g, sortAttrs)

describe("shared UI pieces render what their copies rendered", () => {
  it("EmptyNote", () => {
    expect(html(<EmptyNote>Nothing logged yet.</EmptyNote>)).toBe(
      html(<p className="py-8 text-center text-sm text-muted-foreground">Nothing logged yet.</p>),
    )
  })

  it("PageNotice", () => {
    expect(html(<PageNotice>No access</PageNotice>)).toBe(
      html(<div className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-muted-foreground">No access</div>),
    )
  })

  it("DashedEmptyBox", () => {
    expect(html(<DashedEmptyBox icon={Package}>Nothing here</DashedEmptyBox>)).toBe(
      html(
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <Package className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Nothing here</p>
        </div>,
      ),
    )
  })

  it.each([true, false])("ChoiceChip pill (on=%s), with and without the extra class", (on) => {
    for (const isLast of [true, false]) {
      expect(
        html(
          <ChoiceChip on={on} disabled={isLast} className={isLast ? "cursor-default" : undefined}>
            A
          </ChoiceChip>,
        ),
      ).toBe(
        html(
          <button
            aria-pressed={on}
            disabled={isLast}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              on
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
              isLast && "cursor-default",
            )}
          >
            A
          </button>,
        ),
      )
    }
  })

  it.each([true, false])("ChoiceChip iconPill (on=%s)", (on) => {
    expect(
      html(
        <ChoiceChip variant="iconPill" on={on} type="button" aria-pressed={on}>
          {on && <Check className="h-3 w-3" />}
          Role
        </ChoiceChip>,
      ),
    ).toBe(
      html(
        <button
          type="button"
          aria-pressed={on}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            // The approved single look (docs/design/ui-pieces/variants.md §3): on = primary text too.
            on
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {on && <Check className="h-3 w-3" />}
          Role
        </button>,
      ),
    )
  })
})
