import React, { createContext, useContext, useEffect } from 'react';

/**
 * ⭐ WHY THIS WIDGET WOULD HELP YOU RIGHT NOW — said by the widget itself.
 *
 * The gallery renders each card live, so the card already knows its answer;
 * it says it here instead of the gallery asking again. `need` is how many
 * things are waiting on the member (0 = a calm line, in grey); the gallery
 * puts the widgets with the most waiting first.
 *
 * ⚠️ NO REQUEST OF ITS OWN. A card reports what it has already fetched — a
 * reason must never be the only reason a request happens.
 */
export interface Pitch { need: number; line: string }

const PitchContext = createContext<((p: Pitch) => void) | null>(null);

/** Wraps a card in the gallery; `onPitch` hears what it says. On the home there is no provider, and nothing is said. */
export function PitchProvider({ onPitch, children }: { onPitch: (p: Pitch) => void; children: React.ReactNode }) {
  return <PitchContext.Provider value={onPitch}>{children}</PitchContext.Provider>;
}

/** A card states its pitch; `null` while it does not know yet. */
export function usePitch(pitch: Pitch | null): void {
  const report = useContext(PitchContext);
  const need = pitch?.need;
  const line = pitch?.line;
  useEffect(() => {
    if (report && line != null) report({ need: need ?? 0, line });
  }, [report, need, line]);
}

/** Is this card a preview inside the gallery (rather than on the home)? */
export function useInGallery(): boolean {
  return useContext(PitchContext) != null;
}
