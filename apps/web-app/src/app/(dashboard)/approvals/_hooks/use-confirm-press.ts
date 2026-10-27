"use client"

import { useEffect, useId, useState } from "react"

/**
 * A button that acts only on a SECOND press — a rule or a stand-in is never lost to one stray tap. The first
 * press asks; left alone (6 s — time enough to hear "press again" read aloud and find the key), the question goes
 * away again. `hintId` ties the button to its spoken hint (`ConfirmHint`), so a screen reader hears both.
 */
export function useConfirmPress(onConfirm: () => void, ms = 6000) {
  const [asking, setAsking] = useState(false)
  const hintId = useId()
  useEffect(() => {
    if (!asking) return
    const id = setTimeout(() => setAsking(false), ms)
    return () => clearTimeout(id)
  }, [asking, ms])
  const press = () => {
    if (!asking) return setAsking(true)
    setAsking(false)
    onConfirm()
  }
  return { asking, press, hintId }
}
