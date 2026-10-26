"use client"

import { cn } from "@/lib/utils"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { Shimmer as S } from "./primitives"

/**
 * The generic page shapes (loading-skeletons board): a list, one record, a form, the calendar and messages.
 * The dashboard has its own (DashboardPageSkeleton — it knows which layout this person gets).
 *
 * Widths vary on purpose: identical bars read as a barcode, which is how a skeleton gives itself away.
 */
const TEXT = [
  ["w-48", "w-28", "w-24", "w-20"],
  ["w-40", "w-36", "w-28", "w-16"],
  ["w-56", "w-24", "w-20", "w-24"],
  ["w-36", "w-32", "w-28", "w-20"],
  ["w-52", "w-28", "w-24", "w-16"],
  ["w-44", "w-20", "w-28", "w-24"],
  ["w-40", "w-32", "w-20", "w-20"],
]

function Heading({ action = true }: { action?: boolean }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <S className="h-7 w-44 rounded-lg" />
      {action && <S className="h-9 w-28 rounded-xl" />}
    </div>
  )
}

export function ListShape() {
  return (
    <div className={PAGE_SHELL}>
      <Heading />
      <div className="mb-4 flex flex-wrap gap-2">
        {["w-14", "w-16", "w-20", "w-16"].map((w, i) => (
          <S key={i} className={cn("h-8 rounded-full", w)} />
        ))}
        <S className="ml-auto h-8 w-56 max-w-full rounded-xl" />
      </div>
      <div>
        {TEXT.map(([a, b, c, d], i) => (
          <div key={i} className="flex h-14 items-center gap-3.5 border-b border-shell-line last:border-0">
            <S className="size-8 shrink-0 rounded-full" />
            <div className="min-w-0 flex-[2] space-y-1.5">
              <S className={cn("h-3.5 max-w-full rounded", a)} />
              <S className={cn("h-3 max-w-full rounded", b)} />
            </div>
            <S className={cn("hidden h-3.5 flex-1 rounded md:block", c)} />
            <S className={cn("hidden h-3.5 flex-1 rounded md:block", d)} />
            <S className="h-[22px] w-16 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

function Block({ lines }: { lines: string[] }) {
  return (
    <div className="space-y-3 rounded-2xl border border-shell-line p-4">
      {lines.map((w, i) => (
        <S key={i} className={cn("h-3.5 max-w-full rounded", w)} />
      ))}
    </div>
  )
}

export function DetailShape() {
  return (
    <div className={PAGE_SHELL}>
      <Heading />
      <div className="mb-4 flex h-9 gap-5 border-b border-shell-line">
        {["w-16", "w-20", "w-12", "w-14"].map((w, i) => (
          <S key={i} className={cn("h-3.5 rounded", w)} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Block lines={["w-3/5", "w-2/5", "w-1/2", "w-1/3"]} />
          <Block lines={["w-1/4", "w-11/12", "w-4/5"]} />
        </div>
        <Block lines={["w-1/3", "w-3/4", "w-2/3", "w-3/4", "w-1/2"]} />
      </div>
    </div>
  )
}

export function FormShape() {
  return (
    <div className={PAGE_SHELL}>
      <Heading action={false} />
      <div className="max-w-[620px] space-y-5">
        {["w-28", "w-20", "w-24", "w-32"].map((w, i) => (
          <div key={i} className="space-y-2">
            <S className={cn("h-3 rounded", w)} />
            <S className="h-10 w-full rounded-xl" />
          </div>
        ))}
        <S className="h-9 w-24 rounded-xl" />
      </div>
    </div>
  )
}

export function CalendarShape() {
  return (
    <div className={PAGE_SHELL}>
      <Heading />
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 28 }, (_, i) => (
          <div key={i} className="min-h-[76px] space-y-1.5 rounded-xl border border-shell-line p-2">
            <S className="h-3 w-4 rounded" />
            {i % 5 === 1 && <S className="h-4 w-4/5 rounded-md" />}
            {i % 7 === 3 && <S className="h-4 w-3/5 rounded-md" />}
          </div>
        ))}
      </div>
    </div>
  )
}

export function MessagesShape() {
  return (
    <div className="flex h-full min-h-[480px]">
      <div className="hidden w-[300px] shrink-0 space-y-1 border-r border-shell-line p-3 md:block">
        {TEXT.slice(0, 6).map(([a, b], i) => (
          <div key={i} className="flex h-14 items-center gap-2.5 px-2">
            <S className="size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <S className={cn("h-3.5 max-w-full rounded", b)} />
              <S className={cn("h-3 max-w-full rounded", a)} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-1 flex-col justify-end gap-3 p-5">
        {(["w-40", "w-32 self-end", "w-52", "w-24 self-end"] as const).map((w, i) => (
          <S key={i} className={cn("h-10 rounded-2xl", w)} />
        ))}
        <S className="mt-2 h-11 w-full rounded-2xl" />
      </div>
    </div>
  )
}
