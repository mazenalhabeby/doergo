"use client"

import { createContext, useContext, useState, useCallback } from "react"

interface ActivityPanelContextType {
  isOpen: boolean
  toggle: () => void
}

const ActivityPanelContext = createContext<ActivityPanelContextType>({
  isOpen: true,
  toggle: () => {},
})

export function ActivityPanelProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(true)
  const toggle = useCallback(() => setIsOpen(prev => !prev), [])

  return (
    <ActivityPanelContext.Provider value={{ isOpen, toggle }}>
      {children}
    </ActivityPanelContext.Provider>
  )
}

export function useActivityPanel() {
  return useContext(ActivityPanelContext)
}
