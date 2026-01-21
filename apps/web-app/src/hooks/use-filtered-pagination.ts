"use client"

import { useState, useCallback } from "react"

interface FilterState {
  [key: string]: string
}

interface UseFilteredPaginationOptions {
  initialFilters?: FilterState
  initialPage?: number
  defaultLimit?: number
}

interface UseFilteredPaginationReturn<T extends FilterState> {
  filters: T
  page: number
  limit: number
  setFilter: (key: keyof T, value: string) => void
  setFilters: (filters: Partial<T>) => void
  setPage: (page: number) => void
  resetFilters: (defaultFilters: T) => void
  nextPage: () => void
  prevPage: () => void
}

/**
 * Hook for managing filter state and pagination together.
 * Automatically resets to page 1 when any filter changes.
 *
 * @example
 * ```tsx
 * const { filters, page, setFilter, setPage } = useFilteredPagination({
 *   initialFilters: { status: "all", priority: "all" },
 *   defaultLimit: 10,
 * })
 *
 * // When filter changes, page resets to 1
 * setFilter("status", "NEW") // page becomes 1
 * ```
 */
export function useFilteredPagination<T extends FilterState>({
  initialFilters = {} as T,
  initialPage = 1,
  defaultLimit = 10,
}: UseFilteredPaginationOptions = {}): UseFilteredPaginationReturn<T> {
  const [filters, setFiltersState] = useState<T>(initialFilters as T)
  const [page, setPageState] = useState(initialPage)
  const limit = defaultLimit

  // Set a single filter and reset page to 1
  const setFilter = useCallback((key: keyof T, value: string) => {
    setFiltersState((prev) => ({ ...prev, [key]: value }))
    setPageState(1)
  }, [])

  // Set multiple filters at once and reset page to 1
  const setFilters = useCallback((newFilters: Partial<T>) => {
    setFiltersState((prev) => ({ ...prev, ...newFilters }))
    setPageState(1)
  }, [])

  // Set page without affecting filters
  const setPage = useCallback((newPage: number) => {
    setPageState(newPage)
  }, [])

  // Reset all filters to defaults and page to 1
  const resetFilters = useCallback((defaultFilters: T) => {
    setFiltersState(defaultFilters)
    setPageState(1)
  }, [])

  // Go to next page
  const nextPage = useCallback(() => {
    setPageState((p) => p + 1)
  }, [])

  // Go to previous page
  const prevPage = useCallback(() => {
    setPageState((p) => Math.max(1, p - 1))
  }, [])

  return {
    filters,
    page,
    limit,
    setFilter,
    setFilters,
    setPage,
    resetFilters,
    nextPage,
    prevPage,
  }
}
