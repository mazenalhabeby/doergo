import { Suspense } from "react"
import { MessagesView } from "@/components/chat/messages-view"
import { PAGE_WIDTH } from "@/components/ui/page-width"

/** Messages — the conversations of the signed-in person (components/chat). */
export default function MessagesPage() {
  return (
    <div className={`${PAGE_WIDTH} py-4`}>
      <Suspense>
        <MessagesView />
      </Suspense>
    </div>
  )
}
