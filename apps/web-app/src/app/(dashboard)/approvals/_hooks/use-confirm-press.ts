"use client"

import { useEffect, useState } from "react"

/**
 * A button that acts only on a SECOND press — a rule or a stand-in is never lost to one stray tap. The first
 * press asks; left alone, the question goes away again.
 */
export function useConfirmPress(onConfirm: () => void, ms = 4000) {
  const [asking, setAsking] = useState(false)
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
  return { asking, press }
}
