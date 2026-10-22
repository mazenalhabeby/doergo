"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/*
  Drawing a signature in a browser.

  Mobile already has one (react-native-signature-canvas, used on service
  reports); this is its counterpart for office staff, who sign with a trackpad
  or a mouse rather than a finger.

  Three things it has to get right, none of them obvious:

  1. THE BACKING STORE MUST MATCH THE DISPLAY SIZE × devicePixelRatio, or the
     stroke is blurry on every retina screen — which is most of them.

  2. POINTER EVENTS, not mouse events. One code path covers mouse, trackpad,
     stylus and touch; the mouse-plus-touch pairing double-fires on hybrid
     devices and draws every stroke twice.

  3. THE EXPORT MUST BE OPAQUE-BACKGROUND PNG. A transparent signature embedded
     into a PDF renders as nothing on a white page, which looks exactly like a
     document that was never signed.
*/

interface SignaturePadProps {
  onChange: (dataUrl: string | null) => void
  disabled?: boolean
  height?: number
}

export function SignaturePad({ onChange, disabled, height = 180 }: SignaturePadProps) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const dirty = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  /** Size the backing store to the CSS box, scaled for the display. */
  const resize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    // Only resize when it would actually change: assigning width/height clears
    // the canvas, so doing it on every render would erase a stroke in progress.
    const w = Math.round(rect.width * dpr)
    const h = Math.round(rect.height * dpr)
    if (canvas.width === w && canvas.height === h) return

    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.2
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.strokeStyle = "#0f172a"
  }, [])

  useEffect(() => {
    resize()
    window.addEventListener("resize", resize)
    return () => window.removeEventListener("resize", resize)
  }, [resize])

  const pointAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return
    // Capture the pointer so a stroke that leaves the box still finishes
    // cleanly instead of leaving the canvas stuck in a drawing state.
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    const p = pointAt(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return
    const p = pointAt(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    if (!dirty.current) {
      dirty.current = true
      setHasInk(true)
    }
  }

  const end = useCallback(() => {
    if (!drawing.current) return
    drawing.current = false
    const canvas = canvasRef.current
    if (!canvas || !dirty.current) return

    /*
      Flatten onto white before exporting.

      The canvas is transparent where nothing was drawn, and a transparent PNG
      dropped into a PDF page shows nothing at all — indistinguishable from an
      unsigned document.
    */
    const flat = document.createElement("canvas")
    flat.width = canvas.width
    flat.height = canvas.height
    const ctx = flat.getContext("2d")
    if (!ctx) return
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, flat.width, flat.height)
    ctx.drawImage(canvas, 0, 0)
    onChange(flat.toDataURL("image/png"))
  }, [onChange])

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    dirty.current = false
    setHasInk(false)
    onChange(null)
  }

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border-2 border-dashed bg-white dark:bg-slate-950",
          disabled ? "border-slate-200 dark:border-slate-800" : "border-slate-300 dark:border-slate-700",
        )}
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          className={cn("h-full w-full", disabled ? "cursor-not-allowed" : "cursor-crosshair")}
          // Stops the browser panning the page instead of drawing on a touch screen.
          style={{ touchAction: "none" }}
          aria-label={t("documents.sign.padTitle")}
          role="img"
        />
        {/* Baseline and hint, drawn in the DOM rather than on the canvas so
            they never end up in the exported image. */}
        <div className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-slate-200 dark:border-slate-700" />
        {!hasInk && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="text-sm text-slate-400">{t("documents.sign.padHint")}</span>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={disabled || !hasInk}>
          {t("documents.sign.clear")}
        </Button>
      </div>
    </div>
  )
}
