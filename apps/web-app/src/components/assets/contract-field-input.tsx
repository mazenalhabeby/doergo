"use client"

import { Input } from "@/components/ui/input"

/**
 * The bare input inside a field box. Shared by the contract reader (an office reads a contract) and the
 * proposal queue (an office decides a page a member sent in): both show the fields as borderless boxes.
 */
export function ContractFieldInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="—"
      className="mt-1 h-8 border-0 px-0 text-sm shadow-none focus-visible:ring-0"
    />
  )
}
