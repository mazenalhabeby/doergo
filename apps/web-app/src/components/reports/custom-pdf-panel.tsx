"use client"

import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { type CustomPdfOptions } from "@/lib/report-pdf-options"

const ACCENTS = ["#2563EB", "#334155", "#059669", "#7C3AED", "#E11D48", "#D97706"]

// Module-scope so they keep a stable identity across renders (defining these
// inside the component would remount the inputs on every keystroke).
function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { v: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-0.5 rounded-lg bg-muted/70 p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn(
            "flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
            value === o.v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-xl border border-border p-3 space-y-2.5">
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
    {children}
  </div>
)

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <Label className="text-[11px] text-muted-foreground">{label}</Label>
    {children}
  </div>
)

/** The custom template's options (style, layout, sections, text). */
export function CustomPdfPanel({
  custom,
  setC,
  defaultName,
}: {
  custom: CustomPdfOptions
  setC: (patch: Partial<CustomPdfOptions>) => void
  defaultName: string | undefined
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      {/* STYLE */}
      <Group title={t("reports.pdfGroupStyle", "Style")}>
        <Field label={t("reports.pdfAccent", "Accent color")}>
          <div className="flex items-center gap-1.5">
            {ACCENTS.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => setC({ accent: hex })}
                className={cn(
                  "h-6 w-6 rounded-full border-2 transition-transform hover:scale-110",
                  custom.accent.toLowerCase() === hex.toLowerCase() ? "border-foreground" : "border-transparent",
                )}
                style={{ backgroundColor: hex }}
                aria-label={hex}
              />
            ))}
            <label
              className={
                "relative h-6 w-6 rounded-full overflow-hidden border-2 border-dashed " +
                "border-border cursor-pointer grid place-items-center"
              }
              title={t("reports.pdfCustomColor", "Custom color")}
            >
              <span
                className="h-3 w-3 rounded-full"
                style={{ background: "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)" }}
              />
              <input
                type="color"
                value={custom.accent}
                onChange={(e) => setC({ accent: e.target.value })}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </label>
          </div>
        </Field>
        <Field label={t("reports.pdfFont", "Font")}>
          <Seg
            value={custom.font}
            onChange={(v) => setC({ font: v })}
            options={[
              { v: "sans", label: t("reports.pdfSans", "Sans") },
              { v: "serif", label: t("reports.pdfSerif", "Serif") },
            ]}
          />
        </Field>
        <Field label={t("reports.pdfHeader", "Header style")}>
          <Seg
            value={custom.headerStyle}
            onChange={(v) => setC({ headerStyle: v })}
            options={[
              { v: "line", label: t("reports.pdfHdrLine", "Line") },
              { v: "band", label: t("reports.pdfHdrBand", "Band") },
              { v: "minimal", label: t("reports.pdfHdrMin", "Minimal") },
            ]}
          />
        </Field>
      </Group>

      {/* LAYOUT */}
      <Group title={t("reports.pdfGroupLayout", "Layout")}>
        <Field label={t("reports.pdfOrientation", "Orientation")}>
          <Seg
            value={custom.orientation}
            onChange={(v) => setC({ orientation: v })}
            options={[
              { v: "portrait", label: t("reports.pdf_portrait", "Portrait") },
              { v: "landscape", label: t("reports.pdf_landscape", "Landscape") },
            ]}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("reports.pdfPaper", "Paper")}>
            <Seg
              value={custom.paper}
              onChange={(v) => setC({ paper: v })}
              options={[
                { v: "a4", label: "A4" },
                { v: "letter", label: t("reports.pdfLetter", "Letter") },
              ]}
            />
          </Field>
          <Field label={t("reports.pdfDensity", "Density")}>
            <Seg
              value={custom.density}
              onChange={(v) => setC({ density: v })}
              options={[
                { v: "comfortable", label: t("reports.pdfRoomy", "Roomy") },
                { v: "compact", label: t("reports.pdfCompact", "Compact") },
              ]}
            />
          </Field>
        </div>
      </Group>

      {/* SECTIONS */}
      <Group title={t("reports.pdfGroupSections", "Sections")}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {(
            [
              ["logo", "Company logo"],
              ["summary", "KPI summary"],
              ["chart", "Chart"],
              ["table", "Data table"],
              ["signature", "Signature block"],
              ["pageNumbers", "Page numbers"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between">
              <Label className="text-[11px]">{t(`reports.pdfInc_${key}`, label)}</Label>
              <Switch checked={custom[key]} onCheckedChange={(v) => setC({ [key]: v } as Partial<CustomPdfOptions>)} />
            </div>
          ))}
        </div>
        {custom.summary && (
          <Field label={t("reports.pdfSummaryPos", "Summary position")}>
            <Seg
              value={custom.summaryPosition}
              onChange={(v) => setC({ summaryPosition: v })}
              options={[
                { v: "top", label: t("reports.pdfSummaryTop", "Top") },
                { v: "bottom", label: t("reports.pdfSummaryBottom", "End of table") },
              ]}
            />
          </Field>
        )}
        {custom.signature && (
          <Field label={t("reports.pdfSignatureDate", "Signature date")}>
            <div className="flex gap-1.5">
              <Input
                value={custom.signatureDate ?? ""}
                onChange={(e) => setC({ signatureDate: e.target.value })}
                placeholder={t("reports.pdfSignatureDatePlaceholder", "Empty = sign by hand")}
                className="h-9"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0"
                onClick={() => {
                  const d = new Date()
                  setC({
                    signatureDate:
                      `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}` +
                      `/${d.getFullYear()}`,
                  })
                }}
              >
                {t("reports.pdfToday", "Today")}
              </Button>
            </div>
          </Field>
        )}
      </Group>

      {/* TEXT */}
      <Group title={t("reports.pdfGroupText", "Text")}>
        <Field label={t("reports.pdfHeading", "Custom heading (optional)")}>
          <Input
            value={custom.heading}
            onChange={(e) => setC({ heading: e.target.value })}
            placeholder={defaultName}
            className="h-9"
          />
        </Field>
        <Field label={t("reports.pdfNote", "Note / disclaimer (optional)")}>
          <Input
            value={custom.note}
            onChange={(e) => setC({ note: e.target.value })}
            placeholder={t("reports.pdfNotePlaceholder", "e.g. Confidential — internal use only")}
            className="h-9"
          />
        </Field>
      </Group>
    </div>
  )
}
