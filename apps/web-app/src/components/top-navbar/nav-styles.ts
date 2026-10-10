// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------
// `whitespace-nowrap` and `shrink-0`: the bar is a fixed h-14 flex row, so a label
// that wraps or is squeezed breaks the header. Labels differ a lot by language —
// "Team Members" is 12 characters in English and 19 in Spanish ("Miembros del
// equipo") — so this cannot be eyeballed in one locale.
export const navItemBase =
  "relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
export const navItemInactive = "text-muted-foreground hover:text-foreground hover:bg-muted/50"
export const navItemActiveStyle = "text-foreground font-semibold"
export const bottomIndicator =
  "after:absolute after:bottom-[-13px] after:left-1/2 after:-translate-x-1/2 after:h-[2px] after:w-4/5 after:rounded-full after:bg-foreground"

// Mobile menu
export const mobileItemBase =
  "flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors w-full"
export const mobileItemInactive = "text-muted-foreground hover:text-foreground hover:bg-muted/50"
export const mobileItemActiveStyle = "text-foreground font-semibold bg-muted/60"
