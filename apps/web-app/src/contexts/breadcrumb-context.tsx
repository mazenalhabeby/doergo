'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface BreadcrumbOverride {
  segment: string; // The URL segment to override (e.g., the task ID)
  label: string;   // The label to display instead (e.g., task title)
}

interface BreadcrumbContextType {
  overrides: Map<string, string>;
  setOverride: (segment: string, label: string) => void;
  clearOverride: (segment: string) => void;
  clearAll: () => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextType | null>(null);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<Map<string, string>>(new Map());

  const setOverride = useCallback((segment: string, label: string) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(segment, label);
      return next;
    });
  }, []);

  const clearOverride = useCallback((segment: string) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.delete(segment);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setOverrides(new Map());
  }, []);

  return (
    <BreadcrumbContext.Provider value={{ overrides, setOverride, clearOverride, clearAll }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumbOverride() {
  const context = useContext(BreadcrumbContext);
  if (!context) {
    throw new Error('useBreadcrumbOverride must be used within a BreadcrumbProvider');
  }
  return context;
}
