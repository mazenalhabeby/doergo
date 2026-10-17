import { Suspense } from "react"
import { MessagesView } from "@/components/chat/messages-view"

/** Messages — the conversations of the signed-in person (components/chat). */
export default function MessagesPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4">
      <Suspense>
        <MessagesView />
      </Suspense>
    </div>
  )
}
