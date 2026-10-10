"use client"

import { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react"

interface ActivityPanelContextType {
  isOpen: boolean
  toggle: () => void
  /** True while an ActivityPanel is actually mounted on the current page. */
  present: boolean
  setPresent: (v: boolean) => void
}

const ActivityPanelContext = createContext<ActivityPanelContextType>({
  isOpen: true,
  toggle: () => {},
  present: false,
  setPresent: () => {},
})

export function ActivityPanelProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(true)
  const [present, setPresent] = useState(false)
  const toggle = useCallback(() => setIsOpen(prev => !prev), [])

  const value = useMemo(() => ({ isOpen, toggle, present, setPresent }), [isOpen, toggle, present])

  return (
    <ActivityPanelContext.Provider value={value}>
      {children}
    </ActivityPanelContext.Provider>
  )
}

/** Call from ActivityPanel so consumers (e.g. the support button) know a panel
 *  is docked and can avoid overlapping it. */
export function useRegisterActivityPanel() {
  const { setPresent } = useContext(ActivityPanelContext)
  useEffect(() => {
    setPresent(true)
    return () => setPresent(false)
  }, [setPresent])
}

export function useActivityPanel() {
  return useContext(ActivityPanelContext)
}
