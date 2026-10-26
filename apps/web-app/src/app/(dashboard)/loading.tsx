import { RouteSkeleton } from "@/components/skeletons/route-skeleton"

/**
 * THE loading state for every dashboard page: the shape of the page that is coming (one map, page-shape.ts),
 * after 200 ms. The sidebar and top bar are the layout's — they never load. Do not add a loading.tsx below
 * this one; give the page a shape in page-shape.ts (route-shape.spec fails on a second file).
 */
export default function Loading() {
  return <RouteSkeleton />
}
