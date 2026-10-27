/**
 * Where a key moves the focus in a tab list of `count` tabs, from tab `at`: ← / → to the neighbour (round the
 * ends), Home / End to the first and last. Null for any other key.
 */
export function tabKeyTarget(key: string, at: number, count: number): number | null {
  if (key === "ArrowRight") return (at + 1) % count
  if (key === "ArrowLeft") return (at - 1 + count) % count
  if (key === "Home") return 0
  if (key === "End") return count - 1
  return null
}
