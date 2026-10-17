/**
 * The web's chat colours. Times, days and presence WORDS are one rule with the
 * phone: `chatTime`, `chatDayLabel`, `chatRelTime`, `chatPresenceLabel` in
 * `@hbcfield/shared` (chat/format.ts).
 */
export function presenceColor(p?: string | null) {
  return p === "AVAILABLE"
    ? "bg-emerald-500"
    : p === "BUSY"
      ? "bg-rose-500"
      : p === "AWAY"
        ? "bg-amber-500"
        : "bg-muted-foreground/40"
}
