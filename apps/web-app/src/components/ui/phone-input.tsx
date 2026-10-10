"use client"

import dynamic from "next/dynamic"

/**
 * The phone field, loaded when it is first drawn.
 *
 * The field itself (`phone-input-field.tsx`) carries libphonenumber-js — its
 * formatter plus the numbering plans of every country, ~100 kB — and it sits on
 * the Settings page and in the client screens' dialogs, where most visits never
 * touch a phone number. Here it is its own chunk; the page arrives without it.
 *
 * Until the chunk lands (a moment, from the same server) a box of the same
 * shape holds its place, so nothing jumps when the real field replaces it. It
 * is not typeable — a keystroke into a stand-in would be lost on the swap.
 */
function PhoneInputPlaceholder() {
  return (
    <div className="flex gap-2" aria-busy="true">
      <div className="w-[116px] shrink-0">
        <div className="h-11 w-full rounded-xl border border-input bg-transparent shadow-sm" />
      </div>
      <div className="relative flex-1">
        <div className="h-11 w-full rounded-xl border border-input bg-transparent shadow-sm" />
      </div>
    </div>
  )
}

export const PhoneInput = dynamic(
  () => import("./phone-input-field").then((m) => m.PhoneInput),
  { ssr: false, loading: () => <PhoneInputPlaceholder /> },
)
