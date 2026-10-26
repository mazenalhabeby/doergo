"use client"

import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/page/page-kit"

/** The page's one message in place of the table: no access, or the opening balances could not load. */
export function OpeningNotice({
  text,
  onRetry,
  retryLabel,
}: {
  text: string
  onRetry?: () => void
  retryLabel?: string
}) {
  return (
    <Panel as="div" className="flex items-start gap-3 p-5">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">{text}</p>
      {onRetry && (
        <Button variant="outline" size="pill" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </Panel>
  )
}
