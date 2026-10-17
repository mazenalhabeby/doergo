"use client"

import { FileText, CreditCard } from "lucide-react"
import { DIRECTIONS } from "../_lib/type-options"
import { DIRECTION_ICON } from "./direction-icon"
import { Step, Choice, Toggle, Locked } from "./editor-parts"
import type { TypeEditorState } from "./use-type-editor-logic"

/** Part of TypeEditor's markup, moved here unchanged; it reads the page's state from `vm`. */
export function TypeEditorTypes({ vm }: { vm: TypeEditorState }) {
  const {
    t,
    direction,
    isNew,
    setDirection,
    scanShape,
    setScanShape,
    twoSided,
    setTwoSided,
    setMultiPage,
    multiPage,
  } = vm
  return (
    <Step n={2} title={t("documents.types.step2")}>
      <div className="grid gap-2 sm:grid-cols-3">
        {DIRECTIONS.map((d) => (
          <Choice
            key={d}
            selected={direction === d}
            disabled={!isNew}
            onClick={() => setDirection(d)}
            Icon={DIRECTION_ICON[d]}
            title={t(`documents.types.direction.${d.toLowerCase()}`)}
            hint={t(`documents.types.directionHint.${d.toLowerCase()}`)}
          />
        ))}
      </div>
      {!isNew && <Locked>{t("documents.types.directionLocked")}</Locked>}

      {/* Which sides to photograph. A property of the document itself:
          European ID cards and licences carry the machine-readable zone on
          the back, a passport carries it on the photo page, and a paper
          certificate has nothing on its reverse. */}
      {direction !== "ISSUED" && (
        <div className="mt-3 space-y-3">
          {/*
            The frame the scanner draws. Not decoration: a document held to
            fit the wrong frame sits further from the lens, and how many
            pixels the machine-readable zone occupies is what decides
            whether it can be read at all.
          */}
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("documents.types.scanShape")}
            </p>
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
              {t("documents.types.scanShapeHint")}
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {(["CARD", "PASSPORT", "PAGE"] as const).map((sh) => (
                <Choice
                  key={sh}
                  selected={scanShape === sh}
                  onClick={() => setScanShape(sh)}
                  Icon={sh === "PAGE" ? FileText : CreditCard}
                  title={t(`documents.types.shapes.${sh}.name`)}
                  hint={t(`documents.types.shapes.${sh}.hint`)}
                />
              ))}
            </div>
          </div>

          <Toggle
            checked={twoSided}
            onChange={(v) => { setTwoSided(v); if (v) setMultiPage(false) }}
            title={t("documents.types.twoSided")}
            hint={t("documents.types.twoSidedHint")}
          />

          {/*
            Paper, not a card. Turning this on turns two-sided off: the
            server refuses both together, and a form that lets somebody save
            a rejected combination has wasted their time to no purpose.

            It also switches OFF the scanner on the phone — no frame, no
            machine-readable zone, no expiry prompt — which is the whole
            point for a hotel invoice or a flight confirmation.
          */}
          <Toggle
            checked={multiPage}
            onChange={(v) => { setMultiPage(v); if (v) setTwoSided(false) }}
            title={t("documents.types.multiPage")}
            hint={t("documents.types.multiPageHint")}
          />
        </div>
      )}
    </Step>
  )
}
